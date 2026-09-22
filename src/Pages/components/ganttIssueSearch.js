export const filterIssuesBySearch = ( issues, query ) => {
  const q = query.trim().toLowerCase();
  if ( !q ) return issues;
  return issues.filter(
    ( i ) =>
      ( i.key || "" ).toLowerCase().includes( q ) ||
      ( i.summary || "" ).toLowerCase().includes( q )
  );
};
