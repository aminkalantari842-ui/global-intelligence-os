// ME2026 source registry — S01..S35 exactly as given in the dataset.
// Every ME2026 edge/event cites these ids; the ingest resolves them to typed
// sources (publication, title, url, date, stance).

export interface Me2026Source {
  id: string;
  publication: string;
  title: string;
  date: string; // ISO (month-only dates become the 1st of that month)
  url: string;
}

export const ME2026_DATE = "2026-09-13";

export const ME2026_SOURCES: Me2026Source[] = [
  { id: "S01", publication: "Reuters", title: "Houthi advance in Yemen puts U.S. in a new bind", date: "2026-09-12", url: "https://www.reuters.com/world/middle-east/houthi-advance-yemen-puts-us-new-bind-2026-09-12/" },
  { id: "S02", publication: "Reuters", title: "Gulf of uncertainty", date: "2026-09-09", url: "https://www.reuters.com/world/middle-east/gulf-uncertainty-2026-09-09/" },
  { id: "S03", publication: "Reuters", title: "Gulf oil threatened anew as Houthis reach key island and pipeline is shut down", date: "2026-09-11", url: "https://www.reuters.com/world/middle-east/yemens-houthis-reach-strategic-island-mouth-vital-shipping-lane-2026-09-11/" },
  { id: "S04", publication: "Reuters", title: "Syria's Kurdish-led SDF dissolves as part of integration with Damascus", date: "2026-08-25", url: "https://www.reuters.com/world/middle-east/syrias-kurdish-led-sdf-dissolves-part-integration-with-damascus-2026-08-25/" },
  { id: "S05", publication: "Reuters", title: "Xi pushes Greater BRICS economic ties", date: "2026-09-13", url: "https://www.reuters.com/business/aerospace-defense/xi-pushes-greater-brics-economic-ties-give-bloc-larger-global-role-2026-09-13/" },
  { id: "S06", publication: "Reuters", title: "BRICS adopts joint declaration, urges maximum restraint in Mideast", date: "2026-09-12", url: "https://www.reuters.com/world/china/brics-adopts-joint-declaration-urges-maximum-restraint-mideast-2026-09-12/" },
  { id: "S07", publication: "Reuters", title: "Iran-Oman understanding does not provide immediate reopening of Strait of Hormuz", date: "2026-09-12", url: "https://www.reuters.com/world/middle-east/iran-oman-understanding-does-not-provide-immediate-reopening-strait-hormuz-2026-09-12/" },
  { id: "S08", publication: "Reuters", title: "Why is US ally Iraq unable to disarm Iran's militia allies?", date: "2026-09-09", url: "https://www.reuters.com/world/middle-east/why-is-us-ally-iraq-unable-disarm-irans-militia-allies-2026-09-09/" },
  { id: "S09", publication: "Reuters", title: "Hamas says a top armed commander killed by Israel", date: "2026-09-11", url: "https://www.reuters.com/world/middle-east/hamas-says-top-armed-commander-killed-israel-2026-09-11/" },
  { id: "S10", publication: "AP", title: "Iranian media say 1 killed in ship strike on Strait of Hormuz", date: "2026-09-13", url: "https://apnews.com/article/27d276de911a983cdb1b81101ee56083" },
  { id: "S11", publication: "IMF", title: "Regional Economic Outlook Update: War in the Middle East", date: "2026-04-16", url: "https://www.imf.org/en/publications/reo/meca/issues/2026/04/16/regional-economic-outlook-middle-east-central-asia-april-2026" },
  { id: "S12", publication: "IMF", title: "WEO Update press briefing", date: "2026-07-08", url: "https://www.imf.org/en/news/articles/2026/07/08/tr070826-weo-press-briefing-transcript-july-8-2026" },
  { id: "S13", publication: "World Bank", title: "MENAAP Economic Update – April 2026", date: "2026-04-01", url: "https://www.worldbank.org/en/region/mena/publication/middle-east-north-africa-afghanistan-and-pakistan-economic-update" },
  { id: "S14", publication: "SIPRI", title: "Trends in World Military Expenditure, 2025", date: "2026-04-01", url: "https://www.sipri.org/publications/2026/sipri-fact-sheets/trends-world-military-expenditure-2025" },
  { id: "S15", publication: "SIPRI", title: "Trends in International Arms Transfers, 2025", date: "2026-03-09", url: "https://www.sipri.org/publications/2026/sipri-fact-sheets/trends-international-arms-transfers-2025" },
  { id: "S16", publication: "UNSC", title: "Security Council resolutions archive 2026", date: "2026-01-01", url: "https://main.un.org/securitycouncil/en/content/resolutions-0" },
  { id: "S17", publication: "UNSC", title: "ISIL/Daesh & Al-Qaida Sanctions List", date: "2026-09-04", url: "https://main.un.org/securitycouncil/en/sanctions/1267/aq_sanctions_list" },
  { id: "S18", publication: "NATO", title: "2026 NATO Summit in Ankara", date: "2026-07-08", url: "https://www.nato.int/en/news-and-events/events/2026/07/overview---2026-nato-summit-in-ankara-" },
  { id: "S19", publication: "NATO", title: "NATO cooperation with Qatar / Southern Neighbourhood", date: "2026-07-24", url: "https://www.nato.int/en/news-and-events/articles/news/2026/07/24/nato-special-representative-for-the-southern-neighbourhood-visits-qatar-reaffirms-natos-solidarity-with-gulf-partners" },
  { id: "S20", publication: "CSIS", title: "Preventing Iran's Military Reconstitution", date: "2026-06-23", url: "https://www.csis.org/analysis/preventing-irans-military-reconstitution" },
  { id: "S21", publication: "CSIS", title: "Strategic Ambiguity: Erdoğan's Turkey in a Multipolar World", date: "2025-12-01", url: "https://www.csis.org/analysis/strategic-ambiguity-erdogans-turkey-multipolar-world" },
  { id: "S22", publication: "CSIS", title: "China and CRINK: Implications for Japan and the United States", date: "2026-07-21", url: "https://www.csis.org/analysis/china-and-crink-implications-for-japan-and-united-states" },
  { id: "S23", publication: "CSIS", title: "How Is the Iran War Impacting China's Economy?", date: "2026-04-30", url: "https://chinapower.csis.org/china-economic-impacts-iran-war/" },
  { id: "S24", publication: "Carnegie", title: "In MENA, America and China Converge More Than They Diverge", date: "2026-07-01", url: "https://carnegieendowment.org/research/2026/07/middle-east-north-africa-united-states-china-trade-military-diplomacy" },
  { id: "S25", publication: "CFR", title: "Conflicts to Watch in 2026", date: "2025-12-01", url: "https://www.cfr.org/reports/conflicts-watch-2026" },
  { id: "S26", publication: "UNHCR", title: "Middle East emergency", date: "2026-09-01", url: "https://www.unhcr.org/emergencies/middle-east-emergency" },
  { id: "S27", publication: "UN Yemen", title: "UN Yemen Country Results Report 2025", date: "2026-06-15", url: "https://yemen.un.org/en/317368-un-yemen-country-results-report-2025" },
  { id: "S28", publication: "UAE Government", title: "President and federal government", date: "2026-07-01", url: "https://u.ae/about-the-uae/the-uae-government/the-president-and-his-deputy" },
  { id: "S29", publication: "Saudi Press Agency", title: "Crown Prince chairs Cabinet session", date: "2026-07-14", url: "https://www.spa.gov.sa/en/N2633973" },
  { id: "S30", publication: "Government of India", title: "Council of Ministers portfolios 25 July 2026", date: "2026-07-25", url: "https://www.pmindia.gov.in/en/news_updates/portfolios-of-the-union-council-of-ministers-2/?comment=disable&tag_term=" },
  { id: "S31", publication: "Pakistan Presidency", title: "President Zardari welcomes Iran-US MoU", date: "2026-06-18", url: "https://www.president.gov.pk/president-zardari-welcomes-signing-of-islamabad-memorandum-of-understanding-2" },
  { id: "S32", publication: "Egypt SIS", title: "President Abdel Fattah El-Sisi biography", date: "2026-06-03", url: "https://sis.gov.eg/en/presidency/the-president/" },
  { id: "S33", publication: "UN", title: "MENA conflict and humanitarian system 2026", date: "2026-09-01", url: "https://www.un.org/" },
  { id: "S34", publication: "OPEC", title: "OPEC official data portal", date: "2026-01-01", url: "https://www.opec.org/opec-data.html" },
  { id: "S35", publication: "World Bank", title: "MENAAP regional page", date: "2026-01-01", url: "https://www.worldbank.org/ext/en/region/mena" },
];

export const ME2026_SOURCE_BY_ID = new Map(ME2026_SOURCES.map((s) => [s.id, s]));

// Resolve citation ids to typed event sources. Deterministic stance rule:
// ≥2 independent citations → CORROBORATING; single citation → REPORTING.
export function resolveSources(ids: string[]) {
  return ids
    .map((id) => ME2026_SOURCE_BY_ID.get(id))
    .filter((s): s is Me2026Source => Boolean(s))
    .map((s) => ({
      publication: s.publication,
      title: s.title,
      url: s.url,
      date: s.date,
      stance: ids.length >= 2 ? ("CORROBORATING" as const) : ("REPORTING" as const),
    }));
}

// Latest cited date wins (deterministic event timestamp).
export function latestSourceTs(ids: string[]): number {
  let max = new Date(ME2026_DATE).getTime();
  for (const id of ids) {
    const s = ME2026_SOURCE_BY_ID.get(id);
    if (s) max = Math.max(max, new Date(s.date).getTime());
  }
  return max;
}
