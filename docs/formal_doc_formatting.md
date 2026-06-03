# Formal Document Formatting Rules

## Font

- Family: Arial — entire document, no exceptions

## Font Sizes

| Element      | Size  | Word XML (half-pts) |
|--------------|-------|---------------------|
| Title        | 18pt  | sz=36               |
| Header       | 14pt  | sz=28               |
| Sub-header   | 12pt  | sz=24               |
| Body         | 11pt  | sz=22               |
| Table text   | 10pt  | sz=20               |
| References   | 10pt  | sz=20               |

- **Header** maps to Heading 1 and Heading 2
- **Sub-header** maps to Heading 3 and the custom Sub-header style
- **References** applies to the references/footer section at the end of the document

## Line Spacing

- 1.0 throughout the entire document (Word XML: `w:line="240"`)
- No exceptions — applies to body, headings, table cells, and all other text

## Paragraph Spacing

- 0pt before and 0pt after on all paragraphs
- Do not use spacing before/after to create visual separation — use empty lines instead

## Margins

- 1 inch on all four sides

## Empty Lines

Empty lines are inserted as actual empty paragraphs, not via spacing settings.

**Add one empty paragraph:**
- After every body paragraph
- After every table

**Do NOT add an empty paragraph:**
- After a heading or sub-header
- Between consecutive bullet points (mid-list)

**Last bullet rule:**
- Add one empty paragraph after the last bullet point in a list (i.e., when the next element is not also a bullet)
