'use strict';

let _;
const { dependencies } = require('./appDependencies');
const { commentDeactivatedStatement } = require('./commentsHelper');
const {
	retrieveContainerName,
	retrieveEntityName,
	retrivePropertyFromConfig,
	retrieveIsItemActivated,
} = require('./generalHelper');
const { getOptions, getPrimaryKeyList } = require('./tableHelper');

const setDependencies = ({ lodash }) => (_ = lodash);

const getColumnNames = (collectionRefsDefinitionsMap, columns) => {
	return _.uniq(
		Object.keys(columns).map(name => {
			const id = _.get(columns, [name, 'GUID']);

			const itemData = Object.keys(collectionRefsDefinitionsMap).find(viewFieldId => {
				const definitionData = collectionRefsDefinitionsMap[viewFieldId];

				return definitionData.definitionId === id;
			});

			return `"${_.get(itemData, 'name', name)}"`;
		}),
	).filter(_.identity);
};

const getWhereStatement = (primaryKeys, columnsNames) => {
	if (_.isEmpty(columnsNames)) {
		return '';
	}
	return (
		'WHERE ' +
		columnsNames
			.filter(name => !primaryKeys.includes(name))
			.reduce((statement, name) => {
				if (!statement) {
					return `${name} IS NOT NULL`;
				}

				return `${statement} AND ${name} IS NOT NULL`;
			}, '')
	);
};

const getNamesByIds = (collectionRefsDefinitionsMap, ids) => {
	return ids.reduce((hash, id) => {
		const name = _.get(collectionRefsDefinitionsMap, [id, 'name']);
		if (!name) {
			return hash;
		}
		return Object.assign({}, hash, {
			[id]: { name: name },
		});
	}, {});
};

const getClusteringKeyData = (collectionRefsDefinitionsMap, viewData) => {
	const clusteringKeys = retrivePropertyFromConfig(viewData, 0, 'compositeClusteringKey', []);

	const clusteringKeysHash = getNamesByIds(
		collectionRefsDefinitionsMap,
		clusteringKeys.map(key => key.keyId),
	);

	return { clusteringKeys, clusteringKeysHash };
};

const getPrimaryKeysNames = (collectionRefsDefinitionsMap, viewData) => {
	const partitionKeys = retrivePropertyFromConfig(viewData, 0, 'compositePartitionKey', []);
	const partitionKeysHash = getNamesByIds(
		collectionRefsDefinitionsMap,
		partitionKeys.map(key => key.keyId),
	);

	return _.values(partitionKeysHash)
		.filter(_.identity)
		.map(field => `"${field.name}"`);
};

const getPrimaryKeyScript = (collectionRefsDefinitionsMap, viewData, isParentActivated) => {
	const partitionKeys = retrivePropertyFromConfig(viewData, 0, 'compositePartitionKey', []);
	const partitionKeysHash = getNamesByIds(
		collectionRefsDefinitionsMap,
		partitionKeys.map(key => key.keyId),
	);
	const clusteringKeyData = getClusteringKeyData(collectionRefsDefinitionsMap, viewData);

	const keysList = getPrimaryKeyList(partitionKeysHash, clusteringKeyData.clusteringKeysHash, isParentActivated);
	if (!keysList) {
		return '';
	}

	return `PRIMARY KEY (${keysList})`;
};

const addTab = script => _.trim(script || '').replace(/  /g, '    ');

const getOptionsScript = (collectionRefsDefinitionsMap, viewData) => {
	setDependencies(dependencies);
	const clusteringKeyData = getClusteringKeyData(collectionRefsDefinitionsMap, viewData);
	const tableComment = retrivePropertyFromConfig(viewData, 0, 'comments', '');
	const tableOptions = retrivePropertyFromConfig(viewData, 0, 'tableOptions', '');

	return addTab(
		getOptions(
			clusteringKeyData.clusteringKeys,
			clusteringKeyData.clusteringKeysHash,
			'',
			tableOptions,
			tableComment,
		),
	);
};

module.exports = {
	getOptionsScript,
	getViewScript({
		schema,
		viewData,
		entityData,
		containerData,
		collectionRefsDefinitionsMap,
		isKeyspaceActivated = true,
	}) {
		setDependencies(dependencies);
		let script = [];
		const columns = schema.properties || {};
		const view = _.first(viewData) || {};

		const entityName = retrieveEntityName(entityData);
		const bucketName = retrieveContainerName(containerData);
		const tableName = bucketName ? `"${bucketName}"."${entityName}"` : `"${entityName}"`;
		const viewName = view.code || view.name;
		const name = bucketName ? `"${bucketName}"."${viewName}"` : `"${viewName}"`;

		const isViewActivated = retrieveIsItemActivated(entityData) && retrieveIsItemActivated(viewData);
		const isViewChildrenActivated = isKeyspaceActivated && isViewActivated;

		const primaryKeyScript = getPrimaryKeyScript(collectionRefsDefinitionsMap, viewData, isViewChildrenActivated);
		const optionsScript = getOptionsScript(collectionRefsDefinitionsMap, viewData);

		script.push(`CREATE MATERIALIZED VIEW ${view.viewIfNotExist ? `IF NOT EXISTS ` : ``}${name}`);

		if (!columns) {
			script.push(`AS SELECT * FROM ${tableName};`);
		} else {
			const columnsNames = getColumnNames(collectionRefsDefinitionsMap, columns);
			script.push(`AS SELECT ${columnsNames.join(', ')}`);
			script.push(`FROM ${tableName}`);
			const primaryKeysNames = getPrimaryKeysNames(collectionRefsDefinitionsMap, viewData);
			script.push(getWhereStatement(primaryKeysNames, columnsNames));
		}

		if (primaryKeyScript) {
			script.push(primaryKeyScript);
		}

		if (optionsScript) {
			script.push(optionsScript);
		}

		return commentDeactivatedStatement(script.join('\n  ') + ';', isViewActivated, isKeyspaceActivated);
	},
};
