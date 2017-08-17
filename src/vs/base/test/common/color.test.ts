/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Color, RGBA, HSLA, HSVA } from 'vs/base/common/color';

suite('Color', () => {

	test('isLighterColor', function () {
		let color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.ok(color1.isLighterThan(color2));

		// Abyss theme
		assert.ok(Color.fromHex('#770811').isLighterThan(Color.fromHex('#000c18')));
	});

	test('getLighterColor', function () {
		let color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.deepEqual(color1.hsla, Color.getLighterColor(color1, color2).hsla);
		assert.deepEqual(new HSLA(0, 0, 0.918, 1), Color.getLighterColor(color2, color1).hsla);
		assert.deepEqual(new HSLA(0, 0, 0.851, 1), Color.getLighterColor(color2, color1, 0.3).hsla);
		assert.deepEqual(new HSLA(0, 0, 0.980, 1), Color.getLighterColor(color2, color1, 0.7).hsla);
		assert.deepEqual(new HSLA(0, 0, 1, 1), Color.getLighterColor(color2, color1, 1).hsla);

	});

	test('isDarkerColor', function () {
		let color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.ok(color2.isDarkerThan(color1));

	});

	test('getDarkerColor', function () {
		let color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.deepEqual(color2.hsla, Color.getDarkerColor(color2, color1).hsla);
		assert.deepEqual(new HSLA(60, 1, 0.392, 1), Color.getDarkerColor(color1, color2).hsla);
		assert.deepEqual(new HSLA(60, 1, 0.435, 1), Color.getDarkerColor(color1, color2, 0.3).hsla);
		assert.deepEqual(new HSLA(60, 1, 0.349, 1), Color.getDarkerColor(color1, color2, 0.7).hsla);
		assert.deepEqual(new HSLA(60, 1, 0.284, 1), Color.getDarkerColor(color1, color2, 1).hsla);

		// Abyss theme
		assert.deepEqual(new HSLA(355, 0.875, 0.157, 1), Color.getDarkerColor(Color.fromHex('#770811'), Color.fromHex('#000c18'), 0.4).hsla);
	});

	test('luminance', function () {
		assert.deepEqual(0, new Color(new RGBA(0, 0, 0, 255)).getRelativeLuminance());
		assert.deepEqual(1, new Color(new RGBA(255, 255, 255, 255)).getRelativeLuminance());

		assert.deepEqual(0.2126, new Color(new RGBA(255, 0, 0, 255)).getRelativeLuminance());
		assert.deepEqual(0.7152, new Color(new RGBA(0, 255, 0, 255)).getRelativeLuminance());
		assert.deepEqual(0.0722, new Color(new RGBA(0, 0, 255, 255)).getRelativeLuminance());

		assert.deepEqual(0.9278, new Color(new RGBA(255, 255, 0, 255)).getRelativeLuminance());
		assert.deepEqual(0.7874, new Color(new RGBA(0, 255, 255, 255)).getRelativeLuminance());
		assert.deepEqual(0.2848, new Color(new RGBA(255, 0, 255, 255)).getRelativeLuminance());

		assert.deepEqual(0.5271, new Color(new RGBA(192, 192, 192, 255)).getRelativeLuminance());

		assert.deepEqual(0.2159, new Color(new RGBA(128, 128, 128, 255)).getRelativeLuminance());
		assert.deepEqual(0.0459, new Color(new RGBA(128, 0, 0, 255)).getRelativeLuminance());
		assert.deepEqual(0.2003, new Color(new RGBA(128, 128, 0, 255)).getRelativeLuminance());
		assert.deepEqual(0.1544, new Color(new RGBA(0, 128, 0, 255)).getRelativeLuminance());
		assert.deepEqual(0.0615, new Color(new RGBA(128, 0, 128, 255)).getRelativeLuminance());
		assert.deepEqual(0.17, new Color(new RGBA(0, 128, 128, 255)).getRelativeLuminance());
		assert.deepEqual(0.0156, new Color(new RGBA(0, 0, 128, 255)).getRelativeLuminance());
	});

	test('blending', function () {
		assert.deepEqual(new Color(new RGBA(0, 0, 0, 0)).blend(new Color(new RGBA(243, 34, 43))), new Color(new RGBA(243, 34, 43)));
		assert.deepEqual(new Color(new RGBA(255, 255, 255)).blend(new Color(new RGBA(243, 34, 43))), new Color(new RGBA(255, 255, 255)));
		assert.deepEqual(new Color(new RGBA(122, 122, 122, 178.5)).blend(new Color(new RGBA(243, 34, 43))), new Color(new RGBA(158, 95, 98)));
		assert.deepEqual(new Color(new RGBA(0, 0, 0, 147.9)).blend(new Color(new RGBA(255, 255, 255, 84.15))), new Color(new RGBA(49, 49, 49, 182)));
	});

	suite('HSLA', () => {
		test('HSLA.toRGBA', function () {
			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 0, 0, 0)), new RGBA(0, 0, 0, 0));
			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 0, 0, 1)), new RGBA(0, 0, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 0, 1, 1)), new RGBA(255, 255, 255, 255));

			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 1, 0.5, 1)), new RGBA(255, 0, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(120, 1, 0.5, 1)), new RGBA(0, 255, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(240, 1, 0.5, 1)), new RGBA(0, 0, 255, 255));

			assert.deepEqual(HSLA.toRGBA(new HSLA(60, 1, 0.5, 1)), new RGBA(255, 255, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(180, 1, 0.5, 1)), new RGBA(0, 255, 255, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(300, 1, 0.5, 1)), new RGBA(255, 0, 255, 255));

			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 0, 0.753, 1)), new RGBA(192, 192, 192, 255));

			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 0, 0.502, 1)), new RGBA(128, 128, 128, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(0, 1, 0.251, 1)), new RGBA(128, 0, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(60, 1, 0.251, 1)), new RGBA(128, 128, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(120, 1, 0.251, 1)), new RGBA(0, 128, 0, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(300, 1, 0.251, 1)), new RGBA(128, 0, 128, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(180, 1, 0.251, 1)), new RGBA(0, 128, 128, 255));
			assert.deepEqual(HSLA.toRGBA(new HSLA(240, 1, 0.251, 1)), new RGBA(0, 0, 128, 255));
		});

		test('HSLA.fromRGBA', function () {
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 0, 0, 0)), new HSLA(0, 0, 0, 0));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 0, 0, 255)), new HSLA(0, 0, 0, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(255, 255, 255, 255)), new HSLA(0, 0, 1, 1));

			assert.deepEqual(HSLA.fromRGBA(new RGBA(255, 0, 0, 255)), new HSLA(0, 1, 0.5, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 255, 0, 255)), new HSLA(120, 1, 0.5, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 0, 255, 255)), new HSLA(240, 1, 0.5, 1));

			assert.deepEqual(HSLA.fromRGBA(new RGBA(255, 255, 0, 255)), new HSLA(60, 1, 0.5, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 255, 255, 255)), new HSLA(180, 1, 0.5, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(255, 0, 255, 255)), new HSLA(300, 1, 0.5, 1));

			assert.deepEqual(HSLA.fromRGBA(new RGBA(192, 192, 192, 255)), new HSLA(0, 0, 0.753, 1));

			assert.deepEqual(HSLA.fromRGBA(new RGBA(128, 128, 128, 255)), new HSLA(0, 0, 0.502, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(128, 0, 0, 255)), new HSLA(0, 1, 0.251, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(128, 128, 0, 255)), new HSLA(60, 1, 0.251, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 128, 0, 255)), new HSLA(120, 1, 0.251, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(128, 0, 128, 255)), new HSLA(300, 1, 0.251, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 128, 128, 255)), new HSLA(180, 1, 0.251, 1));
			assert.deepEqual(HSLA.fromRGBA(new RGBA(0, 0, 128, 255)), new HSLA(240, 1, 0.251, 1));
		});
	});

	suite('HSVA', () => {
		test('HSVA.toRGBA', function () {
			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 0, 0, 0)), new RGBA(0, 0, 0, 0));
			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 0, 0, 1)), new RGBA(0, 0, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 0, 1, 1)), new RGBA(255, 255, 255, 255));

			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 1, 1, 1)), new RGBA(255, 0, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(120, 1, 1, 1)), new RGBA(0, 255, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(240, 1, 1, 1)), new RGBA(0, 0, 255, 255));

			assert.deepEqual(HSVA.toRGBA(new HSVA(60, 1, 1, 1)), new RGBA(255, 255, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(180, 1, 1, 1)), new RGBA(0, 255, 255, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(300, 1, 1, 1)), new RGBA(255, 0, 255, 255));

			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 0, 0.753, 1)), new RGBA(192, 192, 192, 255));

			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 0, 0.502, 1)), new RGBA(128, 128, 128, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(0, 1, 0.502, 1)), new RGBA(128, 0, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(60, 1, 0.502, 1)), new RGBA(128, 128, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(120, 1, 0.502, 1)), new RGBA(0, 128, 0, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(300, 1, 0.502, 1)), new RGBA(128, 0, 128, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(180, 1, 0.502, 1)), new RGBA(0, 128, 128, 255));
			assert.deepEqual(HSVA.toRGBA(new HSVA(240, 1, 0.502, 1)), new RGBA(0, 0, 128, 255));
		});

		test('HSVA.fromRGBA', () => {

			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 0, 0, 0)), new HSVA(0, 0, 0, 0));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 0, 0, 255)), new HSVA(0, 0, 0, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(255, 255, 255, 255)), new HSVA(0, 0, 1, 1));

			assert.deepEqual(HSVA.fromRGBA(new RGBA(255, 0, 0, 255)), new HSVA(0, 1, 1, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 255, 0, 255)), new HSVA(120, 1, 1, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 0, 255, 255)), new HSVA(240, 1, 1, 1));

			assert.deepEqual(HSVA.fromRGBA(new RGBA(255, 255, 0, 255)), new HSVA(60, 1, 1, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 255, 255, 255)), new HSVA(180, 1, 1, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(255, 0, 255, 255)), new HSVA(300, 1, 1, 1));

			assert.deepEqual(HSVA.fromRGBA(new RGBA(192, 192, 192, 255)), new HSVA(0, 0, 0.753, 1));

			assert.deepEqual(HSVA.fromRGBA(new RGBA(128, 128, 128, 255)), new HSVA(0, 0, 0.502, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(128, 0, 0, 255)), new HSVA(0, 1, 0.502, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(128, 128, 0, 255)), new HSVA(60, 1, 0.502, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 128, 0, 255)), new HSVA(120, 1, 0.502, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(128, 0, 128, 255)), new HSVA(300, 1, 0.502, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 128, 128, 255)), new HSVA(180, 1, 0.502, 1));
			assert.deepEqual(HSVA.fromRGBA(new RGBA(0, 0, 128, 255)), new HSVA(240, 1, 0.502, 1));
		});
	});

	suite('Format', () => {
		suite('CSS', () => {
			test('parseHex', () => {

				// invalid
				assert.deepEqual(Color.Format.CSS.parseHex(null), null);
				assert.deepEqual(Color.Format.CSS.parseHex(''), null);
				assert.deepEqual(Color.Format.CSS.parseHex('#'), null);
				assert.deepEqual(Color.Format.CSS.parseHex('#0102030'), null);

				// somewhat valid
				assert.deepEqual(Color.Format.CSS.parseHex('#FFFFG0').rgba, new RGBA(255, 255, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#FFFFg0').rgba, new RGBA(255, 255, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#-FFF00').rgba, new RGBA(15, 255, 0, 255));

				// valid
				assert.deepEqual(Color.Format.CSS.parseHex('#000000').rgba, new RGBA(0, 0, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#FFFFFF').rgba, new RGBA(255, 255, 255, 255));

				assert.deepEqual(Color.Format.CSS.parseHex('#FF0000').rgba, new RGBA(255, 0, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#00FF00').rgba, new RGBA(0, 255, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0000FF').rgba, new RGBA(0, 0, 255, 255));

				assert.deepEqual(Color.Format.CSS.parseHex('#FFFF00').rgba, new RGBA(255, 255, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#00FFFF').rgba, new RGBA(0, 255, 255, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#FF00FF').rgba, new RGBA(255, 0, 255, 255));

				assert.deepEqual(Color.Format.CSS.parseHex('#C0C0C0').rgba, new RGBA(192, 192, 192, 255));

				assert.deepEqual(Color.Format.CSS.parseHex('#808080').rgba, new RGBA(128, 128, 128, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#800000').rgba, new RGBA(128, 0, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#808000').rgba, new RGBA(128, 128, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#008000').rgba, new RGBA(0, 128, 0, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#800080').rgba, new RGBA(128, 0, 128, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#008080').rgba, new RGBA(0, 128, 128, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#000080').rgba, new RGBA(0, 0, 128, 255));

				assert.deepEqual(Color.Format.CSS.parseHex('#010203').rgba, new RGBA(1, 2, 3, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#040506').rgba, new RGBA(4, 5, 6, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#070809').rgba, new RGBA(7, 8, 9, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0a0A0a').rgba, new RGBA(10, 10, 10, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0b0B0b').rgba, new RGBA(11, 11, 11, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0c0C0c').rgba, new RGBA(12, 12, 12, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0d0D0d').rgba, new RGBA(13, 13, 13, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0e0E0e').rgba, new RGBA(14, 14, 14, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#0f0F0f').rgba, new RGBA(15, 15, 15, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#a0A0a0').rgba, new RGBA(160, 160, 160, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#CFA').rgba, new RGBA(204, 255, 170, 255));
				assert.deepEqual(Color.Format.CSS.parseHex('#CFA8').rgba, new RGBA(204, 255, 170, 136));
			});
		});
	});
});