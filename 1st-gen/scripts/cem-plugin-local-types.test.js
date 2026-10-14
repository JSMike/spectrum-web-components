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
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const ts = createRequire(
  import.meta.resolve('@custom-elements-manifest/analyzer')
)('typescript');
import { create } from '@custom-elements-manifest/analyzer';
import { litPlugin } from '@custom-elements-manifest/analyzer/src/features/framework-plugins/lit/lit.js';
import config from '../custom-elements-manifest.config.js';
import localTypesPlugin from './cem-plugin-local-types.js';

const analyze = (path, source, plugins = []) =>
  create({
    modules: [ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)],
    plugins: [...litPlugin(), ...plugins, ...config.plugins],
  });

const field = (manifest, declaration, name) =>
  manifest.modules[0].declarations
    .find((item) => item.name === declaration)
    .members.find((member) => member.name === name);

test('button named unions reference their published declaration module', () => {
  const source = readFileSync(
    new URL('../packages/button/src/Button.ts', import.meta.url),
    'utf8'
  );
  const manifest = analyze('src/Button.ts', source);
  for (const [name, type] of [
    ['variant', 'ButtonVariants'],
    ['treatment', 'ButtonTreatments'],
  ]) {
    assert.deepEqual(field(manifest, 'Button', name).type.references, [
      { name: type, module: 'src/Button.js' },
    ]);
    const button = manifest.modules[0].declarations.find(
      (item) => item.name === 'Button'
    );
    assert.deepEqual(
      button.attributes.find((item) => item.fieldName === name).type.references,
      [{ name: type, module: 'src/Button.js' }]
    );
  }
});

test('finds nested named types without matching string literals or private aliases', () => {
  const manifest = analyze(
    'src/Example.ts',
    `
    export interface Options { value: string; }
    type Private = string;
    export class Example extends HTMLElement {
      options: Array<Options | Private>;
      label: 'Options';
      external: External;
    }
  `
  );
  assert.deepEqual(field(manifest, 'Example', 'options').type.references, [
    { name: 'Options', module: 'src/Example.js' },
  ]);
  assert.equal(field(manifest, 'Example', 'label').type.references, undefined);
  assert.equal(
    field(manifest, 'Example', 'external').type.references,
    undefined
  );
});

test('retains existing reference locations', () => {
  const reference = { name: 'Options', package: '@example/types' };
  const manifest = analyze(
    'src/Example.ts',
    `
    export type Options = string;
    export class Example extends HTMLElement { options: Options; }
  `,
    [
      {
        moduleLinkPhase({ moduleDoc }) {
          moduleDoc.declarations.find(
            (item) => item.name === 'Example'
          ).members[0].type.references = [reference];
        },
      },
    ]
  );
  assert.deepEqual(field(manifest, 'Example', 'options').type.references, [
    reference,
  ]);
});

test('references survive inheritance from another module', () => {
  const manifest = create({
    modules: [
      ts.createSourceFile(
        'src/Base.ts',
        `export type Variant = 'a' | 'b'; export class Base extends HTMLElement { variant: Variant; }`,
        ts.ScriptTarget.Latest,
        true
      ),
      ts.createSourceFile(
        'src/Child.ts',
        `import { Base } from './Base.js'; export class Child extends Base {}`,
        ts.ScriptTarget.Latest,
        true
      ),
    ],
    plugins: [localTypesPlugin()],
  });
  const child = manifest.modules[1].declarations.find(
    (item) => item.name === 'Child'
  );
  assert.deepEqual(
    child.members.find((member) => member.name === 'variant').type.references,
    [{ name: 'Variant', module: 'src/Base.js' }]
  );
});

test('textfield accessor types reference their local exported alias', () => {
  const source = readFileSync(
    new URL('../packages/textfield/src/Textfield.ts', import.meta.url),
    'utf8'
  );
  const manifest = analyze('src/Textfield.ts', source);
  assert.deepEqual(field(manifest, 'Textfield', 'type').type.references, [
    { name: 'TextfieldType', module: 'src/Textfield.js' },
  ]);
});

test('does not invent a named export for a default-exported interface', () => {
  const manifest = analyze(
    'src/Example.ts',
    `
    export default interface Options { value: string; }
    export class Example extends HTMLElement { options: Options; }
  `
  );
  assert.equal(
    field(manifest, 'Example', 'options').type.references,
    undefined
  );
});

test('does not import a generic parameter that shadows a local export', () => {
  const manifest = analyze(
    'src/Example.ts',
    `
    export type Options = 'a' | 'b';
    export class Example<Options> extends HTMLElement { options: Options; }
  `
  );
  assert.equal(
    field(manifest, 'Example', 'options').type.references,
    undefined
  );
});
