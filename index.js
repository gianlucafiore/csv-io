module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "csv-io",
  viewtemplates: [require("./export")],
  actions: { import_csv_file: require("./import-file-action") },
};
