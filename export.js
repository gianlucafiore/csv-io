const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

const stringify = require("csv-stringify");
const URL = require("url").URL;
const {
  text,
  div,
  h5,
  h6,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  hr,
  text_attr, 
  button,
} = require("@saltcorn/markup/tags");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  stateFieldsToQuery,
  readState,
  initial_config_all_fields,
} = require("@saltcorn/data/plugin-helper");

const {
  get_viewable_fields,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const { hashState } = require("@saltcorn/data/utils");

const initial_config = initial_config_all_fields(false);

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Columns",
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          //console.log(context);
          const field_picker_repeat = await field_picker_fields({
            table,
            viewname: context.viewname,
            req,
          });

          const type_pick = field_picker_repeat.find((f) => f.name === "type");
          type_pick.attributes.options = type_pick.attributes.options.filter(
            ({ name }) =>
              ["Field", "JoinField", "Aggregation", "FormulaValue"].includes(
                name
              )
          );

          const use_field_picker_repeat = field_picker_repeat.filter(
            (f) =>
              !["state_field", "col_width", "col_width_units"].includes(f.name)
          );

          return new Form({
            fields: [
              new FieldRepeat({
                name: "columns",
                fancyMenuEditor: true,
                fields: use_field_picker_repeat,
              }),
            ],
          });
        },
      },
      {
        name: 'Style Button',
        form: async cntx =>{
          return new Form({
            fields: [
              {
                name: "statistic",
                label: "Statistic",
                type: "String",
                required: true,
                attributes: {
                  options: statOptions,
                },
              },
              {
                name: "field",
                label: "field",
                type: "String",
                required: true,
                attributes: {
                  options: fieldOptions
                },
              },
              {
                name: "value_fml",
                label: ("Value Formula"),
                class: "validate-expression",
                type: "String",
                required: false,
                showIf: { field: "Formula" }
              },
              {
                name: "where_fml",
                label: ("Where"),
                sublabel: ("Formula"),
                class: "validate-expression",
                type: "String",
                required: false,
              },
              {
                name: "decimal_places",
                label: "Decimal places",
                type: "Integer",
                required: false,
              },
              {
                name: "text_style",
                label: "Text Style",
                type: "String",
                required: true,
                attributes: {
                  options: [
                    { label: "Normal", name: "" },
                    { label: "Heading 1", name: "h1" },
                    { label: "Heading 2", name: "h2" },
                    { label: "Heading 3", name: "h3" },
                    { label: "Heading 4", name: "h4" },
                    { label: "Heading 5", name: "h5" },
                    { label: "Heading 6", name: "h6" },
                    { label: "Bold", name: "font-weight-bold" },
                    { label: "Italics", name: "font-italic" },
                    { label: "Small", name: "small" },
                  ],
                },
              },
              {
                name: "pre_text",
                label: "Text before",
                sublabel: "For example: currency symbol",
                type: "String",
                required: false,
              },
              {
                name: "post_text",
                label: "Text after",
                sublabel: "For example: units",
                type: "String",
                required: false,
              },
            ],
          });
        }
      }
    ],
    
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const run = async (table_id, viewname, { columns }, state, extraArgs) => {
  return button(
    {
      class: "btn btn-primary",
      onclick: `view_post('${viewname}', 'do_download', {});`,
    },
    i({ class: "fas fa-download me-1" }),
    "Export CSV"
  );
};

const async_stringify = (...args) => {
  return new Promise((resolve) => {
    stringify(...args, function (err, output) {
      resolve(output);
    });
  });
};

const do_download = async (
  table_id,
  viewname,
  { columns },
  body,
  { req, res }
) => {
  const table = await Table.findOne(table_id);
  const state = {};
  const referrer = req.get("Referrer");
  if (referrer) {
    const refUrl = new URL(referrer || "");
    for (const [name, value] of refUrl.searchParams) {
      state[name] = value;
    }
  }
  const stateHash = hashState(state, viewname);

  const fields = await table.getFields();
  const { joinFields, aggregations } = picked_fields_to_query(columns, fields);
  const where = await stateFieldsToWhere({ fields, state, table });
  const q = await stateFieldsToQuery({
    state,
    fields,
    prefix: "a.",
    stateHash,
  });

  let rows = await table.getJoinedRows({
    where,
    joinFields,
    aggregations,
    ...q,
    forPublic: !req.user,
    forUser: req.user,
  });
  const tfields = get_viewable_fields(
    viewname,
    stateHash,
    table,
    fields,
    columns,
    false,
    req,
    req.__
  );

  const csvRows = rows.map((row) => {
    const csvRow = {};
    tfields.forEach(({ label, key }) => {
      csvRow[label] = typeof key === "function" ? key(row) : row[key];
    });
    return csvRow;
  });
  const str = await async_stringify(csvRows, { header: true });

  return {
    json: {
      download: {
        blob: Buffer.from(str).toString("base64"),
        filename: `${table.name}.csv`,
        mimetype: "text/csv",
      },
    },
  };
};

module.exports = {
  name: "CSV Export",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
  initial_config,

  routes: { do_download },
};
