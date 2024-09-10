'use strict';

let _;
const { dependencies } = require('./appDependencies');
const { commentDeactivatedStatement, INLINE } = require('./commentsHelper');
const {
	retrieveContainerName,
	retrieveEntityName,
	retrivePropertyFromConfig,
	retrieveIsItemActivated,
} = require('./generalHelper');
const { getOptions, getPrimaryKeyList } = require('./tableHelper');

const setDependencies = ({ lodash }) => (_ = lodash);

const getColumnNames = ({ columnsDefinitions, isParentActivated = true }) => {
	const firstActiveIndex = columnsDefinitions.findIndex(item => item.isActivated);

	return columnsDefinitions.map(({ name, isActivated }, index) => {
		const statement = `${index === 0 || firstActiveIndex === index ? '' : ','} ${name}`;
		return commentDeactivatedStatement(statement, isActivated, isParentActivated, INLINE);
	});
};

const getColumnDefinitions = (collectionRefsDefinitionsMap, columns) => {
	return _.uniq(
		Object.entries(columns).map(([name, definition]) => {
			const id = _.get(columns, [name, 'GUID']);

			const [_id, itemData] = Object.entries(collectionRefsDefinitionsMap).find(
				([_viewFieldId, definitionData]) => definitionData.definitionId === id,
			);

			return {
				name: `"${_.get(itemData, 'name', name)}"`,
				isActivated: _.get(definition, 'isActivated', true),
			};
		}),
	).filter(({ name }) => name);
};

const getWhereStatement = ({ primaryKeysNames, columnsDefinitions, isParentActivated = true }) => {
	if (_.isEmpty(columnsDefinitions)) {
		return '';
	}
	const firstActiveIndex = columnsDefinitions.findIndex(item => item.isActivated);

	return (
		'WHERE ' +
		columnsDefinitions
			.filter(({ name }) => !primaryKeysNames.includes(name))
			.reduce((statement, { name, isActivated }, index) => {
				if (!statement) {
					return commentDeactivatedStatement(`${name} IS NOT NULL`, isActivated, isParentActivated, INLINE);
				}

				return `${statement} ${commentDeactivatedStatement(`${firstActiveIndex ? '' : 'AND '}${name} IS NOT NULL`, isActivated, isParentActivated, INLINE)}`;
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
			const columnsDefinitions = getColumnDefinitions(collectionRefsDefinitionsMap, columns);
			const columnsNames = getColumnNames({ columnsDefinitions, isParentActivated: isViewActivated });
			script.push(`AS SELECT ${columnsNames.join('')}`);
			script.push(`FROM ${tableName}`);
			const primaryKeysNames = getPrimaryKeysNames(collectionRefsDefinitionsMap, viewData);
			script.push(
				getWhereStatement({ primaryKeysNames, columnsDefinitions, isParentActivated: isViewActivated }),
			);
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
