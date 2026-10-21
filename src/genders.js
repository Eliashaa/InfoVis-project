import { INK } from './theme.js'

// Pink for girls' names, blue for boys', everywhere a name or the gender filter is
// shown. Each name in the dataset is listed under one sex only, so a name can carry
// its gender colour on its own. The CSS mirrors these as --female and --male.
//
// The blue sits close to Sweden's. They never encode the same mark: country colours
// fill the bars, lines and dots, gender colours only the name text and chips.
export const GENDER_COLORS = {
  female: '#c8327c',
  male: '#2858b8',
}

export function genderColor(sex) {
  return GENDER_COLORS[sex] ?? INK
}
