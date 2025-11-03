import { getPermalink, getBlogPermalink } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Home',
      href: getPermalink('/'),
      links: [
  { text: 'Features', href: getPermalink('/#features') },
  { text: 'More resources', href: getPermalink('/#more-resources') },
  { text: 'More contents', href: getPermalink('/#more-contents') },
        { text: 'Q&A', href: getPermalink('/#q-and-a') },
        { text: 'Funding', href: getPermalink('/#funding') },
      ],
    },
    {
      text: 'News',
      links: [
        {
          text: 'All news',
          href: getBlogPermalink(),
        },
        {
          text: 'Version',
          href: getPermalink('version', 'category'),
        },
        {
          text: 'Articles',
          href: getPermalink('/category/articles'),
        },
        // removed Article (with MDX), Category Page, and Tag Page per request
      ],
    },
    {
      text: 'Installation',
      links: [
        {
          text: 'Download BASALT',
          href: getPermalink('/landing/download-basalt'),
        },
        {
          text: 'Guidance',
          href: getPermalink('/landing/operating-guidance'),
        },
        // removed click-through, product details, pre-launch, subscription per request
      ],
    },
    {
      text: 'Resource Center',
      href: getPermalink('/resource-center'),
      links: [],
    },
    {
      text: 'Community',
      href: getPermalink('/community'),
    },
  ],
  actions: [{ text: 'Download', href: 'https://github.com/EMBL-PKU/BASALT/tree/master', target: '_blank' }],
};

export const footerData = {
  links: [
    // Mirror the main navigation for footer columns: Home, Installation, News, Resource Center
    {
      title: headerData.links[0].text,
      links: (headerData.links[0].links || []).map((l) => ({ text: l.text, href: l.href })),
    },
    {
      title: headerData.links[1].text,
      links: (headerData.links[1].links || []).map((l) => ({ text: l.text, href: l.href })),
    },
    {
      title: headerData.links[2].text,
      links: (headerData.links[2].links || []).map((l) => ({ text: l.text, href: l.href })),
    },
    {
      title: headerData.links[3].text,
      // Expose href for the column (when no submenu items exist we can link the title)
      href: headerData.links[3].href,
      links: ((headerData.links[3].links && headerData.links[3].links.length) ? headerData.links[3].links.map(l => ({ text: l.text, href: l.href })) : []),
    },
    // Optional Community column (if present in headerData)
    (headerData.links[4] ? {
      title: headerData.links[4].text,
      // If Community has submenu links use them; otherwise expose href and leave links empty
      href: headerData.links[4].href,
      links: (headerData.links[4].links || []).length ? (headerData.links[4].links || []).map((l) => ({ text: l.text, href: l.href })) : [],
    } : null),
  ],
  secondaryLinks: [],
  socialLinks: [
    { ariaLabel: 'X', icon: 'tabler:brand-x', href: '#' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: '#' },
    { ariaLabel: 'Facebook', icon: 'tabler:brand-facebook', href: '#' },
    // RSS removed per request
    { ariaLabel: 'Github', icon: 'tabler:brand-github', href: 'https://github.com/EMBL-PKU/BASALT' },
  ],
  footNote: `
    The original template is provided by <a class="text-white underline dark:text-muted" href="https://github.com/arthelokyo"> Arthelokyo</a> <br> This website is maintained by the PKU EMBL Lab · All rights reserved
  `,
};
