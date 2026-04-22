export type LocaleCode = "en" | "es"

export type LocaleLabels = {
  language: string
  english: string
  spanish: string
  playDaily: string
  openArchive: string
  viewStats: string
  hideStats: string
  howToPlay: string
  start: string
  continue: string
  browse: string
  progress: string
  account: string
  signIn: string
  signInToSave: string
  chooseYourDailyBoard: string
  play: string
  nextPuzzleIn: string
  puzzleBy: string
  miniMode: string
  classicMode: string
  miniDescription: string
  classicDescription: string
  buildStrongestPlay: string
  stats: string
  home: string
  close: string
  archive: string
  switchToSpanish: string
  notNow: string
  suggestedForMexico: string
  localeBetaNote: string
}

export type LocaleConfig = {
  code: LocaleCode
  displayName: string
  browserLanguagePrefixes: string[]
  definitionLocale: "en" | "es"
  blankTileRows: string[]
  labels: LocaleLabels
}
