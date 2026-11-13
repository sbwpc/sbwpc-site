// Sidebar layout editors see in the Studio
export const structure = (S) =>
  S.list()
    .title('SBWPC')
    .items([
      S.listItem().title('Site settings').id('siteSettings').child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      S.divider(),
      S.listItem().title('Pages').schemaType('page').child(S.documentTypeList('page').title('Pages').defaultOrdering([{field: 'path', direction: 'asc'}])),
      S.listItem().title('News').schemaType('post').child(S.documentTypeList('post').title('News').defaultOrdering([{field: 'date', direction: 'desc'}])),
      S.listItem().title('Events').schemaType('event').child(S.documentTypeList('event').title('Events').defaultOrdering([{field: 'start', direction: 'desc'}])),
      S.listItem().title('Photo albums').schemaType('album').child(S.documentTypeList('album').title('Photo albums')),
      S.divider(),
      S.listItem().title('Endorsements').schemaType('endorsement').child(S.documentTypeList('endorsement').title('Endorsements').defaultOrdering([{field: 'order', direction: 'asc'}])),
      S.listItem().title('Civic actions').schemaType('action').child(S.documentTypeList('action').title('Civic actions').defaultOrdering([{field: 'order', direction: 'asc'}])),
      S.listItem().title('Boards and commissions').schemaType('opportunity').child(S.documentTypeList('opportunity').title('Boards and commissions')),
      S.divider(),
      S.listItem().title('Board of Directors').schemaType('person').child(S.documentTypeList('person').title('Board of Directors').defaultOrdering([{field: 'order', direction: 'asc'}])),
      S.listItem().title('Committees').schemaType('committee').child(S.documentTypeList('committee').title('Committees').defaultOrdering([{field: 'order', direction: 'asc'}])),
      S.listItem().title('Adopted positions').schemaType('position').child(S.documentTypeList('position').title('Adopted positions').defaultOrdering([{field: 'order', direction: 'asc'}])),
    ])
