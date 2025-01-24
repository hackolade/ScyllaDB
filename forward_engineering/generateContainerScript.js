const {
	retrieveContainerName,
	retrieveEntityName,
	retrieveUDA,
	retrieveUDF,
	retrieveIndexes,
	retrieveIsItemActivated,
	commentDeactivatedStatement,
	getUserDefinedFunctions,
	getUserDefinedAggregations,
} = require('./helpers/generalHelper');
const { getTableStatement } = require('./helpers/tableHelper');
const { sortUdt, getUdtMap, getUdtScripts, prepareDefinitions } = require('./helpers/udtHelper');
const { getIndexes } = require('./helpers/indexHelper');
const { getKeyspaceStatement } = require('./helpers/keyspaceHelper');
const { getAlterScript } = require('./helpers/updateHelper');
const { getViewScript } = require('./helpers/viewHelper');
const { getScriptOptions } = require('./helpers/getScriptOptions');
const { initPluginConfiguration } = require('../helpers/levelConfigHelper');
const { getScript } = require('./helpers/createHelper');

function generateContainerScript(data, logger, callback, app) {
	try {
		initPluginConfiguration(data.pluginConfiguration, logger);

		if (data.isUpdateScript) {
			const { udtTypeMap, modelDefinitions, externalDefinitions } = prepareDefinitions(data);
			data = { ...data, udtTypeMap, modelDefinitions, externalDefinitions };
			data.scriptOptions = getScriptOptions(data);

			const scripts = data.entities.map(entityId => {
				const jsonSchema = JSON.parse(data.jsonSchema[entityId]);
				data.internalDefinitions = sortUdt(JSON.parse(data.internalDefinitions[entityId]));
				return getAlterScript(jsonSchema, data.udtTypeMap, data);
			});
			callback(null, scripts.filter(Boolean).join('\n\n'));
		} else {
			const modelDefinitions = sortUdt(JSON.parse(data.modelDefinitions));
			const externalDefinitions = JSON.parse(data.externalDefinitions);
			const containerData = data.containerData;
			const cqlScriptData = [];

			const containerName = retrieveContainerName(containerData);
			const keyspace = getKeyspaceStatement(containerData);
			const isKeyspaceActivated = retrieveIsItemActivated(containerData);

			const generalUdtTypeMap = getUdtMap([modelDefinitions, externalDefinitions]);
			const generalUDT = getUdtScripts(
				containerName,
				[externalDefinitions, modelDefinitions],
				generalUdtTypeMap,
				isKeyspaceActivated,
			);

			const UDF = getUserDefinedFunctions(retrieveUDF(containerData));
			const UDA = getUserDefinedAggregations(retrieveUDA(containerData));

			cqlScriptData.push(keyspace, ...generalUDT);

			data.entities.forEach(entityId => {
				const internalDefinitions = sortUdt(JSON.parse(data.internalDefinitions[entityId]));
				const jsonSchema = JSON.parse(data.jsonSchema[entityId]);
				const entityData = data.entityData[entityId];
				const udtTypeMap = {
					...generalUdtTypeMap,
					...getUdtMap([internalDefinitions, jsonSchema]),
				};

				const entityName = retrieveEntityName(entityData);
				const isEntityActivated = retrieveIsItemActivated(entityData);
				const dataSources = [jsonSchema, modelDefinitions, internalDefinitions, externalDefinitions];
				const internalUdt = getUdtScripts(
					containerName,
					[internalDefinitions, jsonSchema],
					udtTypeMap,
					isKeyspaceActivated && isEntityActivated,
				).map(udtStatement =>
					commentDeactivatedStatement(udtStatement, isEntityActivated, isKeyspaceActivated),
				);

				const table = getTableStatement({
					tableData: jsonSchema,
					tableMetaData: entityData,
					keyspaceMetaData: containerData,
					dataSources,
					udtTypeMap,
					isKeyspaceActivated,
				});
				const indexes = getIndexes(
					retrieveIndexes(entityData),
					dataSources,
					entityName,
					containerName,
					isEntityActivated,
					isKeyspaceActivated,
				);

				cqlScriptData.push(...internalUdt, table, indexes);
			});

			cqlScriptData.push(
				...data.views.map(viewId => {
					const viewSchema = JSON.parse(data.jsonSchema[viewId] || '{}');

					return getViewScript({
						schema: viewSchema,
						viewData: data.viewData[viewId],
						entityData: data.entityData[viewSchema.viewOn],
						containerData: data.containerData,
						collectionRefsDefinitionsMap: data.collectionRefsDefinitionsMap,
						isKeyspaceActivated,
					});
				}),
			);

			cqlScriptData.push(UDF, UDA);

			callback(null, commentDeactivatedStatement(getScript(cqlScriptData), isKeyspaceActivated));
		}
	} catch (e) {
		logger.log('error', { message: e.message, stack: e.stack }, 'Cassandra Forward-Engineering Error');

		setTimeout(() => {
			callback({ message: e.message, stack: e.stack });
		}, 150);
	}
}

module.exports = {
	generateContainerScript,
};
