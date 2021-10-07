'use strict'

const { commentDeactivatedStatement } = require('./commentsHelper');
const { tab, getTableNameStatement } = require('./generalHelper');
const { getNamesByIds } = require('./schemaHelper');

const getIndexes = (indexes, dataSources, tableName, keyspaceName, isTableActivated, isKeyspaceActivated) => {
	const indexStatements = unwindIndexes(indexes).map(index => {
		const isIndexKeyActivated = index.isActivated !== false && isIndexColumnKeyActivated(index.SecIndxKey, dataSources);
		const indexStatement = getIndex({
			name: index.name,
			keyspaceName,
			tableName,
			indexColumnStatement:getIndexColumnStatement(index.SecIndxKey, dataSources),
			ifNotExist: index.indexIfNotExist
		}
		);
		return commentDeactivatedStatement(
			indexStatement,
			isIndexKeyActivated,
			isTableActivated && isKeyspaceActivated
		);
	}).join('\n\n');

	return commentDeactivatedStatement(indexStatements, isTableActivated, isKeyspaceActivated);
};

const getIndex = ({name, keyspaceName, tableName, indexColumnStatement,ifNotExist}) => (
	`CREATE INDEX ${ifNotExist ? `IF NOT EXISTS ` : ``}${name ? `"${name}"` : ``}\n${tab(`ON ${getTableNameStatement(keyspaceName, tableName)} (${indexColumnStatement});`)}`	
);

const getIndexColumnStatement = (key, dataSources) => {
	const { name } = getNamesByIds([key.keyId], dataSources)[key.keyId];

	return `"${name}"`;
};

const isIndexColumnKeyActivated = (key, dataSources) => {
	const { isActivated } = getNamesByIds([key.keyId], dataSources)[key.keyId];

	return isActivated !== false;
};

const unwindIndexes = (indexes) => {
	return indexes.reduce((result, index) => {
		return [...result, ...(index.SecIndxKey || []).map((key, i) => {
			return Object.assign({}, index, {
				name: i > 0 ? index.name + '_' + i : index.name,
				SecIndxKey: key
			});
		})];
	}, []);
};

module.exports = {
	getIndexes
};
