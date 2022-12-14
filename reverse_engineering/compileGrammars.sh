#!/bin/bash

java -jar /usr/local/lib/antlr-4.9.2-complete.jar -Dlanguage=JavaScript -lib grammars -o parser -visitor -Xexact-output-dir grammars/CqlLexer.g4
java -jar /usr/local/lib/antlr-4.9.2-complete.jar -Dlanguage=JavaScript -lib grammars -o parser -visitor -Xexact-output-dir grammars/CqlParser.g4
