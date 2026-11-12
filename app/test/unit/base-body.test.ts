import { expect, test } from 'vitest';
import {
	BASE_BODY,
	BASE_CLOTHES,
	UNDERWEAR_BODY,
	UNDERWEAR_CLOTHES,
	basePrompt
} from '../../src/studio/model.ts';
import { creationLooks } from '../../src/studio/create.ts';

// The body's own animation calls describe its clothes. They used to always say "t-shirt and shorts", so a prompt that dressed the
// base differently still asked every body animation for a t-shirt.
test('the body description follows the base body line of the prompt', () => {
	expect(
		creationLooks({ description: `an adult human woman\n${UNDERWEAR_BODY}`, exactPrompt: true })
	).toBe(`an adult human woman, bald, ${UNDERWEAR_CLOTHES}, barefoot, empty hands, no weapon`);
	expect(creationLooks({ description: 'an adult human', exactPrompt: false })).toBe(
		`an adult human, bald, ${UNDERWEAR_CLOTHES}, barefoot, empty hands, no weapon`
	);
	expect(basePrompt('an adult human.')).toBe(`an adult human, ${UNDERWEAR_BODY}`);
	expect(creationLooks({ description: `a human man ${BASE_BODY}`, exactPrompt: true })).toBe(
		`a human man, bald, ${BASE_CLOTHES}, barefoot, empty hands, no weapon`
	);
	expect(creationLooks({ description: 'a knight in plate armor', exactPrompt: true })).toBe(
		'a knight in plate armor, empty hands, no weapon'
	);
});
