#!/usr/bin/env node
/**
 * Every HTMLField in module/data-models.js must be listed under htmlFields in
 * system.json (the server never loads the data models, so an unlisted HTML
 * field is never sanitized), and every listed field must exist.
 *
 * The real model classes are imported under stub field classes and their
 * schemas walked, so an HTMLField is found however it is written (the html()
 * factory or `new HTMLField`) and however deep it sits in a SchemaField. An
 * HTMLField inside an ArrayField or ObjectField fails outright: a dotted
 * htmlFields path cannot name it. The sub-types come from the exported model
 * maps and are checked against system.json documentTypes both ways.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));

/* Stubs: just enough of foundry.data.fields to build each schema as a tree. */
class DataField { constructor(options = {}) { this.options = options; } }
class SchemaField extends DataField { constructor(fields, options) { super(options); this.fields = fields; } }
class ArrayField extends DataField { constructor(element, options) { super(options); this.element = element; } }
class SetField extends ArrayField {}
class EmbeddedDataField extends DataField { constructor(model, options) { super(options); this.model = model; } }
class HTMLField extends DataField {}
const plain = ["StringField", "BooleanField", "NumberField", "ObjectField", "FilePathField", "ColorField",
  "DocumentUUIDField", "ForeignDocumentField", "JSONField", "AnyField", "TypedObjectField", "DocumentIdField"];
const fields = { DataField, SchemaField, ArrayField, SetField, EmbeddedDataField, HTMLField };
for (const name of plain) fields[name] = class extends DataField {};
globalThis.foundry = {
  data: { fields },
  abstract: { TypeDataModel: class { static defineSchema() { return {}; } }, DataModel: class {} },
};
globalThis.game = undefined;

const models = await import(pathToFileURL(path.join(root, "module/data-models.js")).href);

/** Dotted paths of every HTMLField in a schema; errors for ones no path can name. */
const htmlPaths = (schema, prefix, errors, inCollection = false) => {
  const out = [];
  for (const [key, field] of Object.entries(schema ?? {})) {
    const p = prefix ? `${prefix}.${key}` : key;
    const walk = (f, where, collection) => {
      if (f instanceof HTMLField) {
        if (collection) errors.push(`HTML field at "${where}" sits inside an array or object; htmlFields cannot name it`);
        else out.push(where);
      } else if (f instanceof SchemaField) out.push(...htmlPaths(f.fields, where, errors, collection));
      else if (f instanceof ArrayField) walk(f.element, `${where}[]`, true);
      else if (f instanceof EmbeddedDataField) out.push(...htmlPaths(f.model?.defineSchema?.(), where, errors, collection));
    };
    walk(field, p, inCollection);
  }
  return out;
};

const maps = { Actor: models.ACTOR_DATA_MODELS, Item: models.ITEM_DATA_MODELS };
let bad = 0;
const fail = (msg) => { console.error(`  ${msg}`); bad++; };
for (const [doc, map] of Object.entries(maps)) {
  if (!map) { fail(`data-models.js exports no ${doc} model map`); continue; }
  const declaredTypes = Object.keys(manifest.documentTypes?.[doc] ?? {});
  for (const t of declaredTypes) if (!map[t]) fail(`${doc}.${t}: in system.json documentTypes but has no data model`);
  for (const [type, cls] of Object.entries(map)) {
    if (!declaredTypes.includes(type)) fail(`${doc}.${type}: has a data model but is not in system.json documentTypes`);
    const errors = [];
    const actual = new Set(htmlPaths(cls.defineSchema(), "", errors));
    for (const e of errors) fail(`${doc}.${type}: ${e}`);
    const declared = new Set(manifest.documentTypes?.[doc]?.[type]?.htmlFields ?? []);
    for (const f of actual) if (!declared.has(f)) fail(`${doc}.${type}: HTML field "${f}" missing from system.json htmlFields`);
    for (const f of declared) if (!actual.has(f)) fail(`${doc}.${type}: htmlFields lists "${f}" but the model has no such HTML field`);
    // gmOnlyFields is the server's guard (a player's update of the field is refused): it must name real fields.
    const schema = cls.defineSchema();
    for (const f of manifest.documentTypes?.[doc]?.[type]?.gmOnlyFields ?? []) {
      if (!schema[f.split(".")[0]]) fail(`${doc}.${type}: gmOnlyFields lists "${f}" but the model has no such field`);
    }
  }
}
if (bad) process.exit(1);
console.log("fields: htmlFields and gmOnlyFields match the data models.");
