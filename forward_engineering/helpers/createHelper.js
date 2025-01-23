const {
	retrieveContainerName,
	retrieveEntityName,
	retrieveUDA,
	retrieveUDF,
	retrieveIndexes,
	commentDeactivatedStatement,
	retrieveIsItemActivated,
	getUserDefinedFunctions,
	getUserDefinedAggregations,
} = require('./generalHelper');
const { getTableStatement } = require('./tableHelper');
const { getUdtMap, getUdtScripts } = require('./udtHelper');
const { getIndexes } = require('./indexHelper');
const { getKeyspaceStatement } = require('./keyspaceHelper');

const getCreateTableScript = (data, isKeyspaceActivated) => {
	const containerName = retrieveContainerName(data.containerData);
	const entityName = retrieveEntityName(data.entityData);
	const isEntityActivated = retrieveIsItemActivated(data.entityData);
	const isEntityChildrenActivated = isKeyspaceActivated && isEntityActivated;
	const dataSources = [data.externalDefinitions, data.modelDefinitions, data.internalDefinitions, data.jsonSchema];

	const udtTypeMap = getUdtMap(dataSources);
	const UDT = getUdtScripts(containerName, dataSources, udtTypeMap, isEntityChildrenActivated);

	const table = getTableStatement({
		tableData: data.jsonSchema,
		tableMetaData: data.entityData,
		keyspaceMetaData: data.containerData,
		dataSources,
		udtTypeMap,
		isKeyspaceActivated: isEntityChildrenActivated,
	});
	const indexes = getIndexes(
		retrieveIndexes(data.entityData),
		dataSources,
		entityName,
		containerName,
		isEntityChildrenActivated,
	);
	const UDF = getUserDefinedFunctions(retrieveUDF(data.containerData));
	const UDA = getUserDefinedAggregations(retrieveUDA(data.containerData));

	const cqlScript = getScript([UDF, UDA, ...UDT, table, indexes]);

	return commentDeactivatedStatement(cqlScript, isEntityActivated, isKeyspaceActivated);
};

const getScript = structure => {
	return structure.filter(item => item).join('\n\n');
};

module.exports = {
	getScript,
	getCreateTableScript,
};
