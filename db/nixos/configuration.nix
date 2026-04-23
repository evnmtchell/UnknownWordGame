{ modulesPath, config, pkgs, ... }:

{
  # ==========================================
  # 0. IMPORTS (Incus LXC Container)
  # ==========================================
  imports = [ ./incus.nix ];

  # ==========================================
  # 1. CORE SYSTEM & GitOps
  # ==========================================

  system.stateVersion = "25.11";

  system.autoUpgrade = {
    enable = true;
    flake = "github:evnmtchell/UnknownWordGame?dir=db/nixos";
    flags = [ "--update-input" "nixpkgs" "--commit-lock-file" ];
    dates = "02:00";
    randomizedDelaySec = "45min";
  };

  nix.settings.experimental-features = [ "nix-command" "flakes" ];
  nix.settings.sandbox = false;
  systemd.oomd.enable = false;

  # ==========================================
  # NETWORKING (Standard Incus Container Setup)
  # ==========================================
  networking = {
    dhcpcd.enable = false;
    useDHCP = false;
    useHostResolvConf = false;
  };

  systemd.network = {
    enable = true;
    networks."50-eth0" = {
      matchConfig.Name = "eth0";
      networkConfig = { DHCP = "ipv4"; IPv6AcceptRA = true; };
      linkConfig.RequiredForOnline = "routable";
    };
  };

  # ==========================================
  # 2. POSTGRESQL DATABASE
  # ==========================================

  services.postgresql = {
    enable = true;
    package = pkgs.postgresql_15;

    settings = {
      listen_addresses = pkgs.lib.mkForce "*";
      max_connections = 100;
      shared_buffers = "128MB";
      effective_cache_size = "256MB";
      work_mem = "4MB";
      maintenance_work_mem = "64MB";
      log_timezone = "UTC";
      timezone = "UTC";
    };

    authentication = pkgs.lib.mkOverride 10 ''
      # Local connections
      local   all   all                 trust
      # IPv4 connections (from tunnel/internal network)
      host    all   all   0.0.0.0/0     md5
      # IPv6
      host    all   all   ::0/0         md5
    '';

    # Create the lexicon database and user on first boot
    initialScript = pkgs.writeText "pg-init" ''
      CREATE ROLE lexicon WITH LOGIN PASSWORD 'CHANGE_ME_ON_FIRST_BOOT';
      CREATE DATABASE lexicon OWNER lexicon;
      GRANT ALL PRIVILEGES ON DATABASE lexicon TO lexicon;
    '';
  };

  # Run migrations after PostgreSQL starts
  systemd.services.lexicon-migrations = {
    description = "Lexicon DB Migrations";
    after = [ "postgresql.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ config.services.postgresql.package ];

    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = pkgs.writeShellScript "run-migrations" ''
        set -e
        MIGRATIONS_DIR="/etc/nixos/plantos-db/db/migrations"

        # Wait for PostgreSQL to be ready
        for i in $(seq 1 30); do
          if pg_isready -q; then break; fi
          sleep 1
        done

        # Create migrations tracking table if it doesn't exist
        psql -U lexicon -d lexicon -c "
          CREATE TABLE IF NOT EXISTS _migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT now()
          );
        " 2>/dev/null || true

        # Apply each migration in order
        if [ -d "$MIGRATIONS_DIR" ]; then
          for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
            BASENAME=$(basename "$f")
            ALREADY=$(psql -U lexicon -d lexicon -tAc "SELECT 1 FROM _migrations WHERE filename='$BASENAME'" 2>/dev/null || echo "")
            if [ "$ALREADY" != "1" ]; then
              echo "Applying migration: $BASENAME"
              psql -U lexicon -d lexicon -f "$f"
              psql -U lexicon -d lexicon -c "INSERT INTO _migrations (filename) VALUES ('$BASENAME')"
              echo "Applied: $BASENAME"
            else
              echo "Skipping (already applied): $BASENAME"
            fi
          done
        fi

        echo "Migrations complete"
      '';
    };
  };

  # ==========================================
  # 3. SSH SERVER
  # ==========================================

  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "prohibit-password";
      PasswordAuthentication = false;
      PubkeyAuthentication = true;
    };
  };

  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK4U2sleDkFRb9X8lQrWy4R8YPVwW4epTf0mbnFYQ4CN github-actions@plantos"
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHDisG9QHdI88ILuKeHIsGhZRaKsC8OlhXhHjLNnph67 tyler.dennis@plantos.co"
  ];

  networking.firewall = {
    enable = true;
    allowedTCPPorts = [ 22 3100 5432 ];
    allowPing = true;
  };

  # ==========================================
  # LEXICON API SERVICE
  # ==========================================

  systemd.services.lexicon-api = {
    description = "Lexicon API Server";
    after = [ "postgresql.service" "network.target" ];
    requires = [ "postgresql.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ pkgs.nodejs_20 ];
    environment = {
      NODE_ENV = "production";
      PORT = "3100";
    };
    serviceConfig = {
      Type = "simple";
      WorkingDirectory = "/etc/nixos/plantos-db/db/api";
      EnvironmentFile = "/var/lib/secrets/plantos-db.env";
      ExecStart = "${pkgs.nodejs_20}/bin/node src/index.js";
      Restart = "always";
      RestartSec = 10;
    };
  };

  # ==========================================
  # LEXICON PUZZLE GENERATOR (Daily Cron)
  # ==========================================

  systemd.services.lexicon-puzzle-generator = {
    description = "Lexicon Daily Puzzle Generator";
    after = [ "postgresql.service" "network-online.target" "lexicon-api.service" ];
    requires = [ "network-online.target" ];
    wants = [ "lexicon-api.service" ];
    path = [ pkgs.nodejs_20 ];
    environment = {
      NODE_ENV = "production";
      API_BASE = "http://localhost:3100";
    };
    serviceConfig = {
      Type = "oneshot";
      WorkingDirectory = "/etc/nixos/plantos-db/db/scripts";
      EnvironmentFile = "/var/lib/secrets/plantos-db.env";
      ExecStart = "${pkgs.nodejs_20}/bin/node dist/generate-daily.js";
      TimeoutStartSec = "300";
    };
  };

  systemd.timers.lexicon-puzzle-generator = {
    description = "Daily puzzle generation at 03:00";
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "03:00";
      Persistent = true;
      RandomizedDelaySec = "5min";
    };
  };

  # ==========================================
  # 4. CLOUDFLARE TUNNEL
  # ==========================================
  # Configure ingress in the Cloudflare dashboard:
  #   deploy-db.plantos.co     -> ssh://localhost:22
  #   api-lexicon.plantos.co   -> http://localhost:3100

  systemd.services.cloudflared = {
    description = "Cloudflare Tunnel for plantos-db";
    after = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      Type = "simple";
      ExecStart = "${pkgs.cloudflared}/bin/cloudflared tunnel run --token-file /var/lib/secrets/cloudflared.token";
      Restart = "always";
      RestartSec = 10;
    };
  };

  # ==========================================
  # 5. DISASTER RECOVERY
  # ==========================================

  # Daily pg_dump to /var/lib/backups, then borg to rsync.net
  systemd.services.plantos-pgdump = {
    description = "Plantos DB PostgreSQL Backup";
    after = [ "postgresql.service" ];
    path = [ config.services.postgresql.package pkgs.gzip ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = pkgs.writeShellScript "pg-backup" ''
        mkdir -p /var/lib/backups/postgresql
        pg_dump -U lexicon lexicon | gzip > /var/lib/backups/postgresql/lexicon-$(date +%Y%m%d).sql.gz
        # Keep last 7 days of local dumps
        find /var/lib/backups/postgresql -name "*.sql.gz" -mtime +7 -delete
      '';
    };
  };

  systemd.timers.plantos-pgdump = {
    description = "Daily PostgreSQL backup";
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "01:00";
      Persistent = true;
    };
  };

  services.borgbackup.jobs."plantos-db-backup" = {
    paths = [
      "/var/lib/backups/postgresql"
    ];
    repo = "fm2862@fm2862.rsync.net:backup/plantos-db";
    encryption = {
      mode = "repokey-blake2";
      passCommand = "cat /var/lib/secrets/borg-passphrase";
    };
    environment = {
      BORG_REMOTE_PATH = "borg1";
      BORG_RSH = "ssh -o StrictHostKeyChecking=accept-new -i /root/.ssh/id_borg_backup";
    };
    startAt = "daily";
    prune.keep = {
      daily = 7;
      weekly = 4;
      monthly = 6;
    };
  };

  # ==========================================
  # 6. DIRECTORIES
  # ==========================================

  systemd.tmpfiles.rules = [
    "d /etc/nixos/plantos-db 0755 root root -"
    "d /var/lib/secrets 0700 root root -"
    "d /var/lib/backups 0755 root root -"
  ];

  # ==========================================
  # 7. PACKAGES
  # ==========================================

  environment.systemPackages = with pkgs; [
    git
    vim
    htop
    curl
    wget
    nodejs_20
    borgbackup
    netbird
    cloudflared
  ];

  # ==========================================
  # 8. NETBIRD VPN (P2P Mesh Network)
  # ==========================================
  services.netbird.enable = true;
}
