/**
 * The six destinations, one per face tunnel of the sponge.
 *
 * Placeholder copy for now — this phase is about the platform, not the words.
 * Order here is irrelevant; `APERTURES` in `scene/menger.ts` binds each id to a
 * specific axis, and `SECTION_AXIS` in `scene/palette.ts` binds it to a colour.
 */

export type Section = {
	id: string;
	/** Shown beside the aperture on hover, and as the panel's eyebrow. */
	label: string;
	title: string;
	blurb: string;
};

export const SECTIONS: Section[] = [
	{
		id: 'about',
		label: 'About',
		title: 'About',
		blurb: 'Who I am and how I got here.',
	},
	{
		id: 'research',
		label: 'Research',
		title: 'Research',
		blurb: 'Process monitoring, engineering-informed machine learning, computational genomics.',
	},
	{
		id: 'writing',
		label: 'Writing',
		title: 'Writing',
		blurb: 'Notes and essays, published as they are finished.',
	},
	{
		id: 'teaching',
		label: 'Teaching',
		title: 'Teaching',
		blurb: 'Courses taught and lectures given.',
	},
	{
		id: 'index',
		label: 'Index',
		title: 'Index',
		blurb: 'Everything on this site, as a plain list.',
	},
	{
		id: 'contact',
		label: 'Contact',
		title: 'Contact',
		blurb: 'Email, and elsewhere on the web.',
	},
];

export const SECTION_IDS = SECTIONS.map((s) => s.id);
export const byId = (id: string) => SECTIONS.find((s) => s.id === id);
