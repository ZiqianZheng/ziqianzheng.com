/**
 * Canonical profile content, migrated from the old Google Sites page.
 * Raw capture with source URLs lives in `content/site-content.md`.
 */

export const profile = {
	name: 'Ziqian Zheng',
	/** Past role. The site does not currently state a present one. */
	role: 'Software Engineer',
	org: { name: 'WeRide', url: 'https://www.weride.ai/' },
	email: 'zzheng92@wisc.edu',
	intro:
		'Previously a software engineer at WeRide. PhD in Industrial Engineering from the ' +
		'University of Wisconsin–Madison, working on process monitoring, engineering-informed ' +
		'machine learning, and computational genomics.',
} as const;

export const links = {
	scholar: 'https://scholar.google.com/citations?user=lg-PpbcAAAAJ&hl=en',
	linkedin: 'http://linkedin.com/in/ziqian-zheng-10748917a',
	cv: 'https://drive.google.com/file/d/1mCUlqCV-zrhgpvoX90Mlu-SlskgE_yKt/view?usp=sharing',
	github: '',
} as const;

export const affiliations = [
	{ label: 'WeRide', url: 'https://www.weride.ai/' },
	{ label: 'University of Wisconsin–Madison', url: 'https://www.wisc.edu/' },
	{ label: 'SIDA', url: 'https://kaibo.ie.wisc.edu/people.html' },
	{ label: 'Prof. Kaibo Liu', url: 'https://kaibo.ie.wisc.edu/' },
	{ label: "Xi'an Jiaotong University", url: 'http://en.xjtu.edu.cn/' },
	{ label: 'Prof. Chao-Bo Yan', url: 'https://gr.xjtu.edu.cn/en/web/chaoboyan/english' },
] as const;

export type Education = {
	degree: string;
	field: string;
	school: string;
	from: string;
	to: string;
	/**
	 * A programme sitting alongside the degree — an honours track, say. Kept
	 * structured rather than as one string: the About page shows only the label,
	 * and the dates were previously being chopped off with a `split(',')` that
	 * would break the moment a label contained a comma.
	 */
	note?: { label: string; url?: string; from?: string; to?: string };
};

export const education: Education[] = [
	{
		degree: 'Ph.D.',
		field: 'Industrial and Systems Engineering',
		school: 'University of Wisconsin–Madison',
		from: 'Sep 2019',
		to: 'present',
	},
	{
		degree: 'M.S.',
		field: 'Statistics',
		school: 'University of Wisconsin–Madison',
		from: 'Mar 2023',
		to: 'present',
	},
	{
		degree: 'B.Eng.',
		field: 'Automation',
		school: "Xi'an Jiaotong University",
		from: 'Sep 2015',
		to: 'Jun 2019',
		note: {
			label: 'Special Class for the Gifted Young',
			url: "https://en.wikipedia.org/wiki/Special_Class_for_the_Gifted_Young#Xi'an_Jiaotong_University",
			from: 'Sep 2013',
			to: 'Jul 2015',
		},
	},
];

export const researchInterests = [
	'Process modeling, monitoring, prognostics, and decision making',
	'Engineering-informed machine learning and AI',
	'Multimodal data analytics and inference',
	'Statistical and computational genomics',
];

export const researchApplications = [
	'Intelligent and connected systems',
	'Smart manufacturing',
	'Bioinformatics',
];

export type Publication = {
	/** Author list. `self: true` marks Ziqian; `eq: true` marks equal contribution. */
	authors: { name: string; self?: boolean; eq?: boolean }[];
	title: string;
	venue: string;
	year?: number;
	status: 'published' | 'accepted' | 'in press' | 'under revision' | 'in preparation';
	detail?: string;
	links?: { label: string; url: string }[];
};

const Z = { name: 'Zheng, Z.', self: true } as const;

export const publications: Publication[] = [
	{
		authors: [Z, { name: 'Liu, K.' }],
		title: 'A Neural Network-based Adaptive Sampling in Monitoring High-dimensional Processes',
		venue: 'Technometrics',
		status: 'accepted',
	},
	{
		authors: [{ name: 'Li, H.' }, Z, { name: 'Liu, K.' }],
		title:
			'Online Monitoring of High-dimensional Partially Observable Data Streams with Statistical Double Dueling Deep Q-network',
		venue: 'IEEE Transactions on Automation Science and Engineering',
		status: 'accepted',
	},
	{
		authors: [
			{ name: 'Yang, J.', eq: true },
			{ ...Z, eq: true },
			{ name: '…' },
			{ name: 'Peng, J.' },
			{ name: 'Liu, K.' },
			{ name: 'Yu, J.' },
		],
		title: 'Spotiphy enables single-cell spatial whole transcriptomics across the entire section',
		venue: 'Nature Methods',
		status: 'accepted',
		links: [
			{ label: 'python package', url: 'https://pypi.org/project/spotiphy/' },
			{ label: 'code', url: 'https://github.com/jyyulab/Spotiphy' },
			{
				label: 'manuscript',
				url: 'https://www.biorxiv.org/content/10.1101/2024.11.11.623040v1.abstract',
			},
		],
	},
	{
		authors: [Z, { name: 'Ye, H.' }, { name: 'Liu, K.' }],
		title: 'Online Nonparametric Monitoring for Asynchronous Processes with Serial Correlation',
		venue: 'IISE Transactions',
		status: 'in press',
	},
	{
		authors: [
			{ name: 'Ye, H.' },
			Z,
			{ name: 'Cheng, J. R. C.' },
			{ name: 'Hable, B.' },
			{ name: 'Liu, K.' },
		],
		title:
			'Online Monitoring of High-Dimensional Synchronous and Heterogeneous Data Streams for Shifts in Location and Scale',
		venue: 'International Journal of Production Research',
		year: 2023,
		status: 'in press',
	},
	{
		authors: [
			Z,
			{ name: 'Zhao, W.' },
			{ name: 'Hable, B.' },
			{ name: 'Gong, Y.' },
			{ name: 'Wang, X.' },
			{ name: 'Shannon, R. W.' },
			{ name: 'Liu, K.' },
		],
		title: 'Transfer Learning-Based Independent Component Analysis',
		venue: 'IEEE Transactions on Automation Science and Engineering',
		year: 2022,
		status: 'in press',
	},
	{
		authors: [{ name: 'Yan, C. B.' }, Z],
		title:
			'An Effective and Efficient Divide-and-conquer Algorithm for Energy Consumption Optimization Problem in Long Bernoulli Serial Lines',
		venue: 'International Journal of Production Research',
		year: 2021,
		status: 'published',
		detail: '59(23), 7018–7036',
	},
	{
		authors: [{ name: 'Song, C.' }, Z, { name: 'Liu, K.' }],
		title: 'Building Local Models for Flexible Degradation Modeling and Prognostics',
		venue: 'IEEE Transactions on Automation Science and Engineering',
		year: 2021,
		status: 'published',
		detail: '19(4), 3483–3495',
	},
	{
		authors: [{ name: 'Yan, C. B.' }, Z],
		title:
			'Problem Formulation and Solution Methodology for Energy Consumption Optimization in Bernoulli Serial Lines',
		venue: 'IEEE Transactions on Automation Science and Engineering',
		year: 2020,
		status: 'published',
		detail: '18(2), 776–790',
	},
	{
		authors: [{ name: 'Zhang, J.' }, Z, { name: 'Li, J.' }, { name: 'Liu, K.' }],
		title: 'Self-starting Monitoring for High-Dimensional Data Under Sampling Control',
		venue: 'IEEE Transactions on Automation Science and Engineering',
		status: 'in preparation',
	},
	{
		authors: [Z, { name: 'Zhang, J.' }, { name: 'Xiao, L.' }, { name: 'Liu, K.' }],
		title: 'Online Nonparametric Process Monitoring for IoT Systems Using Edge Computing',
		venue: 'IISE Transactions',
		status: 'under revision',
	},
];

export type Teaching = {
	role: string;
	course: string;
	title: string;
	level: string;
	terms: string;
	dept?: string;
};

export const teaching: Teaching[] = [
	{
		role: 'Invited Lecturer',
		course: 'ISyE/ME 612',
		title: 'Information Sensing, and Analysis for Manufacturing Processes',
		level: 'Graduate',
		terms: 'Spring 2024',
		dept: 'Industrial and Systems Engineering, UW–Madison',
	},
	{
		role: 'Teaching Assistant',
		course: 'ISyE/ME 412',
		title: 'Fundamentals of Industrial Data Analytics',
		level: 'Undergraduate',
		terms: 'Spring 2021, Fall 2021, Spring 2022',
		dept: 'Industrial and Systems Engineering, UW–Madison',
	},
	{
		role: 'Grader',
		course: 'ISyE/ME 512',
		title: 'Inspection, Quality Control, and Reliability',
		level: 'Undergraduate',
		terms: 'Fall 2022',
		dept: 'Industrial and Systems Engineering, UW–Madison',
	},
];
