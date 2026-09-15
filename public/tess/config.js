/**
 * Configuration shim for the vendored tessellation engine.
 *
 * Upstream ships as a demo page: the engine reads every setting from a live
 * control panel through a global `Page` object provided by the author's demo
 * framework. We want the visual, not the panel, so this file implements the
 * ~25 methods the engine actually calls and answers each one with a fixed
 * value. That avoids shipping — and then hiding — a UI we never want shown.
 *
 * Must be loaded before main.js, which reads `Page` as soon as it executes.
 *
 * Engine: tessellation-webgl by Jeremie Piellard (MIT). See /tess/LICENSE.
 */
(function () {
	'use strict';

	/**
	 * Settings, matching the upstream defaults Ziqian selected.
	 * Ranges are the author's: density 1–20, balance/zoom/colour 0–1,
	 * scaling 0.25–1.
	 */
	var CONFIG = {
		primitive: 'triangles', // 'quads' | 'triangles'
		density: 16, // 1–20
		balance: 0.5, // 0–1
		zoomingSpeed: 0.3, // 0–1
		scaling: 1, // 0.25–1
		colorVariation: 0.3, // 0–1
		blending: true,
		showIndicators: false,
		displayLines: false,
		lineThickness: 1, // only used when displayLines is true
		linesColor: { r: 0, g: 0, b: 0 },
	};

	// Control ids are upstream's; the engine looks settings up by these.
	var RANGES = {
		'density-range-id': CONFIG.density,
		'balance-range-id': CONFIG.balance,
		'zooming-speed-range-id': CONFIG.zoomingSpeed,
		'scaling-range-id': CONFIG.scaling,
		'color-variation-range-id': CONFIG.colorVariation,
		'thickness-range-id': CONFIG.lineThickness,
	};

	var CHECKBOXES = {
		'multithreaded-checkbox-id': true,
		'blending-checkbox-id': CONFIG.blending,
		'show-indicators-checkbox-id': CONFIG.showIndicators,
		'display-lines-checkbox-id': CONFIG.displayLines,
	};

	var TABS = {
		'primitive-tabs-id': [CONFIG.primitive],
		'plotter-tabs-id': ['webgl'],
	};

	var canvas = null;
	function getCanvas() {
		if (!canvas) {
			canvas = document.getElementById('tessellation-canvas');
			/**
			 * Claim the WebGL context before the engine does, with the engine's
			 * own flags but `preserveDrawingBuffer` turned on.
			 *
			 * A second getContext() for the same type returns the first context
			 * and ignores the new attributes, so whoever asks first decides. We
			 * need the buffer preserved in order to sample the rendered image
			 * later and pick out a triangle; without it the canvas reads back
			 * blank once the frame has been composited.
			 */
			if (canvas) {
				canvas.getContext('webgl', {
					alpha: false,
					antialias: true,
					depth: false,
					stencil: false,
					preserveDrawingBuffer: true,
				});
			}
		}
		return canvas;
	}

	/**
	 * Freeze control. The engine reads the zooming speed afresh every frame and
	 * multiplies it by the frame delta, so reporting 0 makes each frame's zoom
	 * the identity transform — the scene stops dead and resumes exactly where it
	 * left off, with no state to save or restore.
	 */
	var paused = false;

	/** Pointer state, in normalised 0–1 canvas coordinates. */
	var mouse = [0.5, 0.5];
	var mouseDown = false;

	var Observers = {
		canvasResize: [],
		mouseDown: [],
		mouseDrag: [],
		mouseEnter: [],
		mouseExit: [],
		mouseMove: [],
		mouseUp: [],
		mouseWheel: [],
	};

	function fire(list, args) {
		for (var i = 0; i < list.length; i++) list[i].apply(null, args || []);
	}

	var noop = function () {};

	window.Page = {
		version: 'vendored',

		Canvas: {
			Observers: Observers,
			getCanvas: getCanvas,
			getSize: function () {
				var c = getCanvas();
				return c ? [c.clientWidth, c.clientHeight] : [0, 0];
			},
			getMousePosition: function () {
				return mouse;
			},
			isMouseDown: function () {
				return mouseDown;
			},
			// The indicator overlay belongs to the demo page; there is nothing
			// to write to here, and the engine calls these every frame.
			setIndicatorText: noop,
			setIndicatorsVisibility: noop,
			showLoader: noop,
			setMaxSize: noop,
			setFullscreen: noop,
			toggleFullscreen: noop,
		},

		Range: {
			getValue: function (id) {
				if (id === 'zooming-speed-range-id' && paused) return 0;
				return RANGES[id];
			},
			setValue: noop,
			addObserver: noop, // nothing can change, so nothing to observe
			addLazyObserver: noop,
			storeState: noop,
			clearStoredState: noop,
		},

		Checkbox: {
			isChecked: function (id) {
				return !!CHECKBOXES[id];
			},
			setChecked: noop,
			addObserver: noop,
			storeState: noop,
			clearStoredState: noop,
		},

		Tabs: {
			getValues: function (id) {
				return TABS[id] || [];
			},
			setValues: noop,
			addObserver: noop,
			storeState: noop,
			clearStoredState: noop,
		},

		ColorPicker: {
			getValue: function () {
				return CONFIG.linesColor;
			},
			setValue: noop,
			addObserver: noop,
			storeState: noop,
			clearStoredState: noop,
		},

		Button: { addObserver: noop, setLabel: noop },
		FileControl: { addDownloadObserver: noop, addUploadObserver: noop },
		Controls: { setVisibility: noop },
		Demopage: {
			// Surface real failures (no WebGL, shader errors) instead of
			// swallowing them — the page has a static fallback behind it.
			setErrorMessage: function (id, message) {
				console.error('[tessellation] ' + id + ': ' + message);
				document.documentElement.classList.add('tess-failed');
			},
		},
		Sections: { setVisibility: noop },
		Picture: { setVisibility: noop },
		LoadingSpinner: { show: noop, hide: noop },
	};

	/** Small public surface for the page's own interaction code. */
	window.tessellation = {
		pause: function () {
			paused = true;
		},
		resume: function () {
			paused = false;
		},
		isPaused: function () {
			return paused;
		},
		getCanvas: getCanvas,
	};

	// --- wire real browser events into the observers the engine registered ---
	function relativeMouse(event) {
		var c = getCanvas();
		if (!c) return [0.5, 0.5];
		var r = c.getBoundingClientRect();
		return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height];
	}

	addEventListener(
		'resize',
		function () {
			fire(Observers.canvasResize);
		},
		{ passive: true },
	);

	/**
	 * Watch the element itself, not just the window.
	 *
	 * The engine sizes its backing store from `clientWidth` in its constructor,
	 * which runs before the stylesheet has laid the canvas out — so without this
	 * the first frame is rendered at a stale, much lower resolution and nothing
	 * corrects it until the window happens to be resized.
	 */
	if (typeof ResizeObserver !== 'undefined') {
		var ro = new ResizeObserver(function () {
			fire(Observers.canvasResize);
		});
		var attach = function () {
			var c = getCanvas();
			if (c) ro.observe(c);
		};
		if (document.readyState === 'loading') {
			addEventListener('DOMContentLoaded', attach);
		} else {
			attach();
		}
	}

	addEventListener(
		'pointermove',
		function (e) {
			var previous = mouse;
			mouse = relativeMouse(e);
			fire(Observers.mouseMove, [mouse[0], mouse[1]]);
			if (mouseDown) {
				fire(Observers.mouseDrag, [mouse[0] - previous[0], mouse[1] - previous[1]]);
			}
		},
		{ passive: true },
	);

	addEventListener('pointerdown', function (e) {
		mouseDown = true;
		mouse = relativeMouse(e);
		fire(Observers.mouseDown);
	});

	addEventListener('pointerup', function () {
		mouseDown = false;
		fire(Observers.mouseUp);
	});

	// Non-passive: the engine zooms on wheel, and letting the page scroll at
	// the same time would fight it.
	addEventListener(
		'wheel',
		function (e) {
			if (!Observers.mouseWheel.length) return;
			e.preventDefault();
			fire(Observers.mouseWheel, [Math.sign(e.deltaY) * -1, mouse]);
		},
		{ passive: false },
	);
})();
