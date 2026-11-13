import ts from 'typescript';

/** @param {ts.SourceFile} module */
function moduleBindings(module) {
	/** @type {string[]} */
	const names = [];
	/** @param {ts.BindingName} name */
	const collect = (name) => {
		if (ts.isIdentifier(name)) names.push(name.text);
		else
			for (const element of name.elements) if (ts.isBindingElement(element)) collect(element.name);
	};
	for (const statement of module.statements) {
		if (ts.isVariableStatement(statement))
			for (const declaration of statement.declarationList.declarations) collect(declaration.name);
		else if (
			(ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
			statement.name
		)
			names.push(statement.name.text);
	}
	return names;
}

/**
 * Throws unless the canonical runtime modules can be concatenated into the one delivered module: only named
 * declarations (no imports, export lists or defaults) and module-scope names that are unique across files.
 * @param {Readonly<Record<string, string>>} sources module file name to source text
 */
export function assertEmbeddable(sources) {
	/** @type {Map<string, string>} */
	const owners = new Map();
	for (const [name, text] of Object.entries(sources)) {
		const module = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
		const declarations = module.statements.flatMap((statement) =>
			ts.canHaveModifiers(statement)
				? (ts.getModifiers(statement) ?? [])
						.filter((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
						.map((modifier) => modifier.getStart(module))
				: []
		);
		const prefixes = [...text.matchAll(/^export /gm)].map((match) => match.index);
		if (
			declarations.length !== prefixes.length ||
			declarations.some((start, index) => start !== prefixes[index]) ||
			module.statements.some(
				(statement) =>
					ts.isImportDeclaration(statement) ||
					ts.isExportDeclaration(statement) ||
					ts.isExportAssignment(statement) ||
					(ts.canHaveModifiers(statement) &&
						ts
							.getModifiers(statement)
							?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
			)
		)
			throw new Error(
				`${name}: runtime embedding requires named declarations without imports, export lists or defaults.`
			);
		for (const binding of moduleBindings(module)) {
			const owner = owners.get(binding);
			if (owner && owner !== name)
				throw new Error(
					`${name}: top-level binding "${binding}" is already declared in ${owner}. Canonical runtime modules are concatenated into one module, so module-scope names must be unique.`
				);
			owners.set(binding, name);
		}
	}
}
