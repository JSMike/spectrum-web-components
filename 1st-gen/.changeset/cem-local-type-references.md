---
'@spectrum-web-components/button': patch
'@spectrum-web-components/textfield': patch
---

Fixed custom elements manifest references for locally exported types, including `sp-button` variants and treatments and the `sp-textfield` input type. Type-aware consumers can now resolve these named types to their published TypeScript declarations.
