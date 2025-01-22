const { initPluginConfiguration } = require('../helpers/levelConfigHelper');
const { getViewScript } = require('./helpers/viewHelper');

function generateViewScript(data, logger, callback, app) {
	initPluginConfiguration(data.pluginConfiguration, logger);

	const viewSchema = JSON.parse(data.jsonSchema || '{}');

	const script = getViewScript({
		schema: viewSchema,
		viewData: data.viewData,
		entityData: data.entityData,
		containerData: data.containerData,
		collectionRefsDefinitionsMap: data.collectionRefsDefinitionsMap,
	});

	callback(null, script);
}

module.exports = {
	generateViewScript,
};
