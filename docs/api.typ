// API 文档：从 lib.typ 的 /// 注释生成（tidy）。
//
//   typst compile --root . docs/api.typ docs/api.pdf
#import "@preview/tidy:0.4.3"

#set page(width: 210mm, height: auto, margin: (x: 18mm, y: 16mm), fill: white)
#set text(font: ("DejaVu Sans", "Noto Sans CJK SC"), size: 10pt, lang: "zh")
#set par(justify: false)
#show raw: set text(font: ("DejaVu Sans Mono", "Noto Sans CJK SC"))

#let docs = tidy.parse-module(read("../lib.typ"), name: "vtslides", require-all-parameters: true)

#text(size: 22pt, weight: 700)[vtslides] #h(6pt) #text(fill: gray)[API]
#v(4pt)
#eval(docs.description, mode: "markup")
#v(8pt)

#tidy.show-module(
  docs,
  style: tidy.styles.default,
  omit-private-definitions: true,
  show-outline: true,
  sort-functions: none,
)
