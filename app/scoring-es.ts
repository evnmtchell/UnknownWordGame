import { BLANK_TILE } from "./scoring"

export const SPANISH_LETTER_SCORES: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 8,
  L: 1,
  M: 3,
  N: 1,
  Ñ: 8,
  O: 1,
  P: 3,
  Q: 5,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 8,
  X: 8,
  Y: 4,
  Z: 10,
  [BLANK_TILE]: 0,
}

export const SPANISH_RACK_TILE_BAG = [
  ..."AAAAAAAAAAAABBCCDDDEEEEEEEEEEEEFFGGHHIIIIIIJJKLLLLMMMNNNNNNÑOOOOOOOOOPPQRRRRRRRSSSSSTTTTTTUUUUVWXYZ??",
]

export const SPANISH_RACK_VOWELS = ["A", "E", "I", "O", "U"]
