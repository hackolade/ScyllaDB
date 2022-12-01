const { dependencies } = require('../appDependencies');
const { getTableNameStatement } = require('../generalHelper');
const { getIndexes } = require('../indexHelper');
const { getNamesByIds } = require('../schemaHelper');
let _;

const setDependencies = ({ lodash }) => _ = lodash;

let nameCollectionsExistsScript = {
	dropIndexes: [],
	createIndexes: [],
};

const scriptData = {
	index: 'index',
};

const checkExistsScript = (keyspaceName, name, type) => {
	const statement = getTableNameStatement(keyspaceName, name);
	const filteredScriptName = nameCollectionsExistsScript[type].filter(name => name === statement);
	return !!filteredScriptName.length;
}

const setNameCollectionsScript = (keyspaceName, name, type) => {
	const statement = getTableNameStatement(keyspaceName, name);
	nameCollectionsExistsScript = { ...nameCollectionsExistsScript, [type]: [...nameCollectionsExistsScript[type], statement] };
};

const unwindIndexes = (indexes) => {
	return indexes.reduce((result, index) => {
		return [...result, ...(index.SecIndxKey || []).map((key, i) => {
			return Object.assign({}, index, {
				name: i > 0 ? index.name + '_' + i : index.name,
				SecIndxKey: [key]
			});
		})];
	}, []);
};

const getDataForScript = (newData, oldData) => {
	let addData;
	let dropData;
	
	if (!newData.length && !oldData.length) {
		return {};
	}

	if (!newData.length) {
		dropData = oldData;
	} else if (!oldData.length) {
		addData = newData;
	} else if (!_.isEqual(newData, oldData)) {
		const equalElements = _.intersectionWith(newData, oldData, _.isEqual);
		dropData = _.xorWith(oldData, equalElements, _.isEqual);
		addData = _.xorWith(newData, equalElements, _.isEqual);
	}
	return {
		addData,
		dropData,
	}
}

const getDropIndexScript = (keyspaceName, tableName, secIndxs = []) => secIndxs.map(index => {
	const tableNameStatement = getTableNameStatement(keyspaceName, index.name);
	const tableIndexName = `${tableName}.${index.name}`;
	const isExistScript = checkExistsScript(keyspaceName, tableIndexName, 'dropIndexes');
	let script = '';
	if (index.name && !isExistScript) {
		script = `DROP INDEX IF EXISTS ${tableNameStatement};`;
		setNameCollectionsScript(keyspaceName, tableIndexName, 'dropIndexes');
	}
	return {
		...scriptData, deleted: true, script,
	};
})

const getAddIndexScript = data => {
	const { keyspaceName, indexes = [], dataSources, tableName, isActivated } = data;
	const filteredIndexes = indexes.filter(index => {
		const tableIndexName = `${tableName}.${index.name}`;
		const isExistScrip = checkExistsScript(keyspaceName, tableIndexName, 'createIndexes');
		if (isExistScrip) {
			return false;
		}
		setNameCollectionsScript(keyspaceName, tableIndexName, 'createIndexes');
		return true;
	})
	const script = getIndexes(
		filteredIndexes,
		dataSources,
		tableName,
		keyspaceName,
		isActivated,
		true,
	);
	return [{ ...scriptData, added: true, script }];
}

const getCreatedIndex = data => {
	const { item, dataSources, tableName, keyspaceName, isActivated } = data;
	const indexes = _.get(item, 'role.SecIndxs', []);

	const script = getIndexes(
		indexes,
		dataSources,
		tableName,
		keyspaceName,
		isActivated,
		true,
	);
	return [{
		...scriptData,
		added: true,
		script,
	}]
}

const getDeletedIndex = data => {
	const { item, keyspaceName, tableName } = data;
	const indexes = _.get(item, 'role.SecIndxs', []);
	const dropIndexScript = getDropIndexScript(keyspaceName, tableName, indexes);
	return [...dropIndexScript];
}

const getUpdateIndex = data => {
	const { item, keyspaceName, tableName, isActivated, dataSources } = data;
	const { new: newIndexes = [], old: oldIndexes = [] } = _.get(item, 'role.compMod.SecIndxs', {});
	const unwindNewIndexes = unwindIndexes(newIndexes);
	const unwindOldIndexes = unwindIndexes(oldIndexes);

	const dataForIndexScript = getDataForScript(unwindNewIndexes, unwindOldIndexes);

	const dropIndexScript = getDropIndexScript(
		keyspaceName,
		tableName,
		dataForIndexScript.dropData,
	);

	const addIndexScript = getAddIndexScript({
		indexes: dataForIndexScript.addData,
		dataSources,
		tableName,
		keyspaceName,
		isActivated
	});

	return [...dropIndexScript, ...addIndexScript];
};

const getFieldDataByKeyId = (dataSources, idToNameHashTable, keyId) => {
	const fieldData = getNamesByIds([keyId], dataSources)[keyId] || {};
	if (fieldData.name) {
		return fieldData
	}

	const name = idToNameHashTable[keyId] || '';

	return { name };
}

const getDataColumnIndex = (dataSources, idToNameHashTable, column = {}, key = 'key') => {
	setDependencies(dependencies);
	const keyId = _.get(column, `${key}[0].keyId`, '');
	const fieldData = getFieldDataByKeyId(dataSources, idToNameHashTable, keyId);

	return {
		..._.omit(column, key),
		...fieldData,
	};
};

const createDataSources = (item, data) => {
	const properties = { ...item.properties || {}, ...item.role.properties || {} };
	const itemData = { properties, ..._.omit(item.role || {}, ['properties']) };

	return [
		itemData, 
		data.modelDefinitions, 
		data.externalDefinitions, 
		data.internalDefinitions,
		{ properties: item?.properties || {} },
		{ properties: _.get(item, 'role.compMod.newProperties', []) },
		{ properties: _.get(item, 'role.compMod.oldProperties', []) }
	];
};

const getIndexTable = (item, data, tableIsChange) => {
	setDependencies(dependencies);

	const dataSources = createDataSources(item, data);
	const tableName = item.role?.code || item.role?.name;
	const keyspaceName = item.role.compMod?.keyspaceName;
	const isActivated = item.role?.isActivated;

	const { compMod = {} } = item.role || {};

	if (tableIsChange) {
		const createdIndexes = getCreatedIndex({ item, dataSources, tableName, keyspaceName, isActivated });
		const deletedIndex = getDeletedIndex({ item, keyspaceName, tableName });

		return [...createdIndexes, ...deletedIndex];
	}

	if (compMod.created) {
		return getCreatedIndex({ item, dataSources, tableName, keyspaceName, isActivated });
	}

	if (compMod.deleted) {
		return getDeletedIndex({ item, keyspaceName, tableName });
	}
	
	return getUpdateIndex({ item, keyspaceName, tableName, dataSources, isActivated });
}

module.exports = {
	getIndexTable,
	getDataColumnIndex,
}