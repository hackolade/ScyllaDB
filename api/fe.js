const { generateContainerScript } = require('../forward_engineering/generateContainerScript');
const { generateScript } = require('../forward_engineering/generateScript');
const { generateViewScript } = require('../forward_engineering/generateViewScript');
const { isDropInStatements } = require('../forward_engineering/isDropInStatements');

module.exports = {
	generateScript,
	generateViewScript,
	generateContainerScript,
	isDropInStatements,
};
