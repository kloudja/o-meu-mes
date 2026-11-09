export function Icon({name,size=20}:{name:string;size?:number}){
  const paths:Record<string,React.ReactNode>={
    month:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/></>,
    accounts:<><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18m-5 5h2"/></>,
    savings:<><path d="M6 10a7 7 0 0 1 12-2l3 1v6l-3 1-1 4h-3l-1-3h-3l-1 3H6l-1-5H3V9h3Zm4-6 4-1m2 8h.01"/></>,
    recurring:<><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/></>,
    transfer:<path d="M3 8h18m-4-4 4 4-4 4m4 4H3m4-4-4 4 4 4"/>,
    bell:<path d="M10 20a2 2 0 0 0 4 0M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9Z"/>,
    chevron:<path d="m6 9 6 6 6-6"/>,
    base:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/></>,
    settings:<><path d="m12 3 2 3 4-1 1 4 3 3-3 2-1 5-4-1-2 3-2-3-4 1-1-5-3-2 3-3 1-4 4 1Z"/><circle cx="12" cy="12" r="3"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
    check:<path d="m5 12 4 4L19 6"/>,
    close:<path d="m6 6 12 12M6 18 18 6"/>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    leaf:<><path d="M20 3C8 2 2 8 5 15s16 3 15-12ZM5 20 16 9"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.info}</svg>;
}
