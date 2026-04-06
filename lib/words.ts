import words from "an-array-of-english-words"

export const VALID_WORDS = new Set(
  words
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length >= 2 && word.length <= 15)
)

