/**
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/** Add import locations for types declared and exported in the same module. */
export default function localTypesPlugin() {
  const exportsByModule = new Map();
  const typeParametersByModule = new Map();
  return {
    name: 'local-type-references',
    initialize() {
      exportsByModule.clear();
      typeParametersByModule.clear();
    },
    analyzePhase({ ts, node, moduleDoc }) {
      if (ts.isTypeParameterDeclaration(node)) {
        const parameters =
          typeParametersByModule.get(moduleDoc.path) ?? new Set();
        parameters.add(node.name.text);
        typeParametersByModule.set(moduleDoc.path, parameters);
      }
      if (
        (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
        ts.isSourceFile(node.parent) &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
        ) &&
        !node.modifiers.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword
        )
      ) {
        const names = exportsByModule.get(moduleDoc.path) ?? new Set();
        names.add(node.name.text);
        exportsByModule.set(moduleDoc.path, names);
      }
    },
    moduleLinkPhase({ ts, moduleDoc }) {
      const names = exportsByModule.get(moduleDoc.path);
      if (!names) return;

      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.type?.text === 'string') {
          const type = value.type;
          const source = ts.createSourceFile(
            'type.ts',
            `type ManifestType = ${type.text};`,
            ts.ScriptTarget.Latest,
            true
          );
          const references = [...(type.references ?? [])];
          const visitType = (node) => {
            if (
              ts.isTypeReferenceNode(node) &&
              ts.isIdentifier(node.typeName) &&
              names.has(node.typeName.text) &&
              // CEM type text has no lexical scope. Avoid importing a generic
              // parameter as a same-named module export.
              !typeParametersByModule
                .get(moduleDoc.path)
                ?.has(node.typeName.text) &&
              !references.some(
                (reference) => reference.name === node.typeName.text
              )
            ) {
              references.push({
                name: node.typeName.text,
                module: moduleDoc.path.replace(/\.(t|j)sx?$/, '.js'),
              });
            }
            ts.forEachChild(node, visitType);
          };
          visitType(source);
          if (references.length) type.references = references;
        }
        Object.values(value).forEach(visit);
      };
      visit(moduleDoc);
    },
  };
}
