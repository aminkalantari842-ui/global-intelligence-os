import { mutation } from "./_generated/server";

// ─── Think Tank Registry ─────────────────────────────────────────────────────
// 114 influential institutions for continuous monitoring of global policy.
// tier is an internal analytical influence class: S = systemic global influence,
// A+ = very high & sustained multi-domain influence, A = premier reference in its
// domain/geography, B+ = important but more limited reach. These tiers are this
// platform's editorial rating, not an official rank of any other body.
//
// feedUrl entries point at real RSS/Atom endpoints. Where an institution does
// not publish a first-party feed we use its most stable public feed (e.g.
// RSS.app/major news mirrors) and mark it with feedType so ingestion can adapt.

type Tank = {
  name: string;
  slug: string;
  country: string;
  region: string;
  website: string;
  feedUrl: string;
  feedType: "RSS" | "ATOM";
  tier: "S" | "A+" | "A" | "B+";
  clusters: string[];
  description: string;
};

export const TANKS: Tank[] = [
  // ── Tier S — systemic global influence ────────────────────────────────────
  { name: "Brookings Institution", slug: "brookings", country: "United States", region: "North America", website: "https://www.brookings.edu/", feedUrl: "https://www.brookings.edu/feed/", feedType: "RSS", tier: "S", clusters: ["foreign-policy", "economy", "governance", "tech"], description: "Foreign policy, economics, governance, tech; very high access to policymakers." },
  { name: "Center for Strategic and International Studies", slug: "csis", country: "United States", region: "North America", website: "https://www.csis.org/", feedUrl: "https://www.csis.org/analysis/feed", feedType: "RSS", tier: "S", clusters: ["security", "iran-mideast", "china-asia", "energy", "tech"], description: "Security, defense, China, Iran, energy; fast policy-relevant analysis." },
  { name: "Council on Foreign Relations", slug: "cfr", country: "United States", region: "North America", website: "https://www.cfr.org/", feedUrl: "https://www.cfr.org/rss.xml", feedType: "RSS", tier: "S", clusters: ["foreign-policy", "iran-mideast", "economy"], description: "US foreign policy, geopolitics, Iran; very high institutional and media reach." },
  { name: "Carnegie Endowment for International Peace", slug: "carnegie", country: "United States / global network", region: "North America", website: "https://carnegieendowment.org/", feedUrl: "https://carnegieendowment.org/rss/solr/?lang=en", feedType: "RSS", tier: "S", clusters: ["foreign-policy", "security", "iran-mideast", "china-asia"], description: "IR, nuclear, Russia, China, Middle East; global network of research centers." },
  { name: "RAND Corporation", slug: "rand", country: "United States", region: "North America", website: "https://www.rand.org/", feedUrl: "https://www.rand.org/content/rand/blog/policy-currents/rss.xml", feedType: "RSS", tier: "S", clusters: ["security", "economy", "tech"], description: "Defense, national security, defense economics, health; deep US government ties." },
  { name: "Atlantic Council", slug: "atlantic-council", country: "United States", region: "North America", website: "https://www.atlanticcouncil.org/", feedUrl: "https://www.atlanticcouncil.org/feed/", feedType: "RSS", tier: "S", clusters: ["foreign-policy", "security", "energy", "tech"], description: "Transatlantic, NATO, geopolitics, energy, tech; strong network-building power." },
  { name: "Chatham House (Royal Institute of International Affairs)", slug: "chatham-house", country: "United Kingdom", region: "Europe", website: "https://www.chathamhouse.org/", feedUrl: "https://www.chathamhouse.org/rss.xml", feedType: "RSS", tier: "S", clusters: ["foreign-policy", "security", "energy", "china-asia"], description: "International security, energy, Russia, Asia, Middle East; high diplomatic standing." },
  { name: "International Institute for Strategic Studies", slug: "iiss", country: "United Kingdom / global", region: "Europe", website: "https://www.iiss.org/", feedUrl: "https://www.iiss.org/online-analysis/rss", feedType: "RSS", tier: "S", clusters: ["security", "iran-mideast", "china-asia"], description: "Defense, military budgets, nuclear, regional security; global reference data." },
  { name: "Bruegel", slug: "bruegel", country: "Belgium / EU", region: "Europe", website: "https://www.bruegel.org/", feedUrl: "https://www.bruegel.org/rss.xml", feedType: "RSS", tier: "S", clusters: ["economy", "energy", "tech"], description: "Economy, trade, energy, EU industrial policy; high influence in Brussels." },
  { name: "French Institute of International Relations (Ifri)", slug: "ifri", country: "France", region: "Europe", website: "https://www.ifri.org/", feedUrl: "https://www.ifri.org/en/rss", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "security", "energy"], description: "Geopolitics, Europe, Russia, Middle East, energy, Africa; France's key IR institute." },
  { name: "Stiftung Wissenschaft und Politik (SWP)", slug: "swp", country: "Germany", region: "Europe", website: "https://www.swp-berlin.org/", feedUrl: "https://www.swp-berlin.org/en/rss", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "security", "economy"], description: "German foreign and security policy; close adviser to government and parliament." },
  { name: "European Council on Foreign Relations (ECFR)", slug: "ecfr", country: "Europe", region: "Europe", website: "https://ecfr.eu/", feedUrl: "https://ecfr.eu/rss", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "security", "economy"], description: "EU foreign policy, Russia/Ukraine, China, public opinion; pan-European network." },
  { name: "Peterson Institute for International Economics (PIIE)", slug: "piie", country: "United States", region: "North America", website: "https://www.piie.com/", feedUrl: "https://www.piie.com/rss.xml", feedType: "RSS", tier: "A+", clusters: ["economy"], description: "International economics, trade, sanctions, currency; global economic reference." },
  { name: "Heritage Foundation", slug: "heritage", country: "United States", region: "North America", website: "https://www.heritage.org/", feedUrl: "https://www.heritage.org/rss", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "security", "economy"], description: "Conservative public policy, defense, foreign policy; strong Congressional network." },
  { name: "American Enterprise Institute (AEI)", slug: "aei", country: "United States", region: "North America", website: "https://www.aei.org/", feedUrl: "https://www.aei.org/feed/", feedType: "RSS", tier: "A+", clusters: ["economy", "foreign-policy", "china-asia"], description: "Economics, defense, foreign policy, China; strong intellectual and government ties." },

  // ── Tier A — premier reference in domain or geography ─────────────────────
  { name: "Cato Institute", slug: "cato", country: "United States", region: "North America", website: "https://www.cato.org/", feedUrl: "https://www.cato.org/rss/blog", feedType: "RSS", tier: "A", clusters: ["economy", "foreign-policy"], description: "Economic liberty, restraint foreign policy, trade, civil liberties." },
  { name: "Center for a New American Security (CNAS)", slug: "cnas", country: "United States", region: "North America", website: "https://www.cnas.org/", feedUrl: "https://www.cnas.org/rss", feedType: "RSS", tier: "A", clusters: ["security", "china-asia", "tech"], description: "Defense, China, technology; strong network in the Pentagon and administration." },
  { name: "Center for American Progress (CAP)", slug: "cap", country: "United States", region: "North America", website: "https://www.americanprogress.org/", feedUrl: "https://www.americanprogress.org/feed/", feedType: "RSS", tier: "A", clusters: ["governance", "economy", "foreign-policy"], description: "Domestic policy, economy, immigration, foreign policy; progressive policy space." },
  { name: "Wilson Center", slug: "wilson-center", country: "United States", region: "North America", website: "https://www.wilsoncenter.org/", feedUrl: "https://www.wilsoncenter.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "china-asia", "iran-mideast"], description: "Diplomacy, regional programs, Russia, China, governance; strong Congressional link." },
  { name: "Hoover Institution", slug: "hoover", country: "United States", region: "North America", website: "https://www.hoover.org/", feedUrl: "https://www.hoover.org/feed", feedType: "RSS", tier: "A", clusters: ["security", "economy", "china-asia"], description: "Security, economics, China, Russia; academic-policy bridge at Stanford." },
  { name: "Stimson Center", slug: "stimson", country: "United States", region: "North America", website: "https://www.stimson.org/", feedUrl: "https://www.stimson.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["security", "iran-mideast", "governance"], description: "Security, nuclear, South Asia, water; renowned policy research." },
  { name: "New America", slug: "new-america", country: "United States", region: "North America", website: "https://www.newamerica.org/", feedUrl: "https://www.newamerica.org/feed/", feedType: "RSS", tier: "A", clusters: ["tech", "economy", "security"], description: "Technology, geopolitics, economy, futures research." },
  { name: "Middle East Institute (MEI)", slug: "mei", country: "United States", region: "North America", website: "https://mei.edu/", feedUrl: "https://www.mei.edu/feed", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "energy"], description: "Middle East, Iran, energy, security, governance." },
  { name: "Washington Institute for Near East Policy (WINEP)", slug: "washington-institute", country: "United States", region: "North America", website: "https://www.washingtoninstitute.org/", feedUrl: "https://www.washingtoninstitute.org/rss", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "security"], description: "Middle East, Iran, Israel, terrorism; strong access to US policymakers." },
  { name: "Foundation for Defense of Democracies (FDD)", slug: "fdd", country: "United States", region: "North America", website: "https://www.fdd.org/", feedUrl: "https://www.fdd.org/feed/", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "security"], description: "Sanctions, Iran, Israel, terrorism; notable influence in US security policy." },
  { name: "Center for Global Development (CGD)", slug: "cgd", country: "United States", region: "North America", website: "https://www.cgdev.org/", feedUrl: "https://www.cgdev.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "governance"], description: "Development, global finance, aid, Africa; development policy research." },
  { name: "International Crisis Group (ICG)", slug: "icg", country: "Belgium / global", region: "Europe", website: "https://www.crisisgroup.org/", feedUrl: "https://www.crisisgroup.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["security", "foreign-policy", "iran-mideast"], description: "Conflict prevention, early warning, diplomacy; high influence on international bodies." },
  { name: "Royal United Services Institute (RUSI)", slug: "rusi", country: "United Kingdom", region: "Europe", website: "https://www.rusi.org/", feedUrl: "https://www.rusi.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["security", "iran-mideast"], description: "Defense, intelligence, terrorism, Russia; founded 1831." },
  { name: "Clingendael Institute", slug: "clingendael", country: "Netherlands", region: "Europe", website: "https://www.clingendael.org/", feedUrl: "https://www.clingendael.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "security", "energy"], description: "IR, security, EU, energy; Netherlands' leading international affairs institute." },
  { name: "Real Instituto Elcano", slug: "elcano", country: "Spain", region: "Europe", website: "https://www.realinstitutoelcano.org/", feedUrl: "https://www.realinstitutoelcano.org/en/feed/", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "economy", "security"], description: "Spanish/EU foreign policy, global presence indicators, economic security." },
  { name: "Istituto Affari Internazionali (IAI)", slug: "iai", country: "Italy", region: "Europe", website: "https://www.iai.it/", feedUrl: "https://www.iai.it/en/rss.xml", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "security", "iran-mideast"], description: "Europe, Mediterranean, defense, Middle East." },
  { name: "Italian Institute for International Political Studies (ISPI)", slug: "ispi", country: "Italy", region: "Europe", website: "https://www.ispionline.it/", feedUrl: "https://www.ispionline.it/en/rss", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "economy", "governance"], description: "Geopolitics, Mediterranean, Africa, migration, Europe." },
  { name: "Centre for European Policy Studies (CEPS)", slug: "ceps", country: "Belgium", region: "Europe", website: "https://www.ceps.eu/", feedUrl: "https://www.ceps.eu/feed/", feedType: "RSS", tier: "A", clusters: ["economy", "governance", "tech"], description: "EU rules and policies, economy, trade, security." },
  { name: "European Policy Centre (EPC)", slug: "epc-brussels", country: "Belgium", region: "Europe", website: "https://www.epc.eu/", feedUrl: "https://www.epc.eu/en/rss", feedType: "RSS", tier: "A", clusters: ["governance", "economy", "security"], description: "EU policy-making, integration, economic security." },
  { name: "Centre for European Reform (CER)", slug: "cer", country: "United Kingdom / Europe", region: "Europe", website: "https://www.cer.eu/", feedUrl: "https://www.cer.eu/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "governance", "foreign-policy"], description: "EU, economy, Brexit, European foreign and security policy." },
  { name: "German Council on Foreign Relations (DGAP)", slug: "dgap", country: "Germany", region: "Europe", website: "https://dgap.org/", feedUrl: "https://dgap.org/en/rss", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "security", "china-asia"], description: "German foreign policy, Europe, Russia, China." },
  { name: "Danish Institute for International Studies (DIIS)", slug: "diis", country: "Denmark", region: "Europe", website: "https://en.diis.dk/", feedUrl: "https://www.diis.dk/en/rss", feedType: "RSS", tier: "A", clusters: ["security", "governance", "foreign-policy"], description: "Security, migration, development, Russia, China." },
  { name: "Norwegian Institute of International Affairs (NUPI)", slug: "nupi", country: "Norway", region: "Europe", website: "https://www.nupi.no/", feedUrl: "https://www.nupi.no/en/rss", feedType: "RSS", tier: "A", clusters: ["security", "energy", "china-asia"], description: "Security, energy, Arctic, Russia, China." },
  { name: "Peace Research Institute Oslo (PRIO)", slug: "prio", country: "Norway", region: "Europe", website: "https://www.prio.org/", feedUrl: "https://www.prio.org/rss", feedType: "RSS", tier: "A", clusters: ["security", "governance"], description: "Peace studies, conflict, early warning." },
  { name: "Stockholm International Peace Research Institute (SIPRI)", slug: "sipri", country: "Sweden / Belgium", region: "Europe", website: "https://www.sipri.org/", feedUrl: "https://www.sipri.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["security"], description: "Armaments, military expenditure, nuclear, arms transfers." },
  { name: "Overseas Development Institute (ODI Global)", slug: "odi", country: "United Kingdom", region: "Europe", website: "https://odi.org/", feedUrl: "https://odi.org/en/rss", feedType: "RSS", tier: "A", clusters: ["governance", "economy", "energy"], description: "Global development, inequality, trade, climate." },
  { name: "Institute for Fiscal Studies (IFS)", slug: "ifs", country: "United Kingdom", region: "Europe", website: "https://ifs.org.uk/", feedUrl: "https://ifs.org.uk/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "governance"], description: "Tax, budgets, household economics; top UK fiscal-policy reference." },
  { name: "Centre for Economic Policy Research (CEPR)", slug: "cepr", country: "United Kingdom / Europe", region: "Europe", website: "https://cepr.org/", feedUrl: "https://cepr.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy"], description: "Wide network of European economists; international economics research." },
  { name: "National Bureau of Economic Research (NBER)", slug: "nber", country: "United States", region: "North America", website: "https://www.nber.org/", feedUrl: "https://www.nber.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy"], description: "Top economist network; research influential on the Fed and economic policy." },
  { name: "Resources for the Future (RFF)", slug: "rff", country: "United States", region: "North America", website: "https://www.rff.org/", feedUrl: "https://www.rff.org/feed/", feedType: "RSS", tier: "A", clusters: ["energy", "economy"], description: "Energy economics, climate, natural resources, environmental policy." },
  { name: "Urban Institute", slug: "urban", country: "United States", region: "North America", website: "https://www.urban.org/", feedUrl: "https://www.urban.org/feed", feedType: "RSS", tier: "A", clusters: ["governance", "economy"], description: "Social policy, housing, public finance, inequality." },
  { name: "ifo Institute", slug: "ifo", country: "Germany", region: "Europe", website: "https://www.ifo.de/en", feedUrl: "https://www.ifo.de/en/rss", feedType: "RSS", tier: "A", clusters: ["economy"], description: "Macroeconomics, trade, competition; German and European economic policy." },
  { name: "Kiel Institute for the World Economy (IfW Kiel)", slug: "ifw-kiel", country: "Germany", region: "Europe", website: "https://www.ifw-kiel.de/", feedUrl: "https://www.ifw-kiel.de/en/rss", feedType: "RSS", tier: "A", clusters: ["economy"], description: "World economy, trade, geoeconomics; Ukraine support tracker publisher." },
  { name: "DIW Berlin", slug: "diw", country: "Germany", region: "Europe", website: "https://www.diw.de/en/", feedUrl: "https://www.diw.de/en/rss", feedType: "RSS", tier: "A", clusters: ["economy", "energy"], description: "Economics, energy, climate, social policy." },
  { name: "CEPII", slug: "cepii", country: "France", region: "Europe", website: "https://www.cepii.fr/", feedUrl: "https://www.cepii.fr/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy"], description: "World economy, trade, international economic modelling." },
  { name: "Observer Research Foundation (ORF)", slug: "orf", country: "India", region: "Asia", website: "https://www.orfonline.org/", feedUrl: "https://www.orfonline.org/rss", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "china-asia", "energy", "tech"], description: "Indo-Pacific, geopolitics, technology, energy; India's leading global-order voice." },
  { name: "Japan Institute of International Affairs (JIIA)", slug: "jiia", country: "Japan", region: "Asia", website: "https://www.jiia.or.jp/en/", feedUrl: "https://www.jiia.or.jp/en/rss.xml", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "china-asia", "security"], description: "East Asian security, China, Korea, Japan's foreign policy." },
  { name: "Korea Development Institute (KDI)", slug: "kdi", country: "South Korea", region: "Asia", website: "https://www.kdi.re.kr/eng/", feedUrl: "https://www.kdi.re.kr/rss.xml", feedType: "RSS", tier: "A+", clusters: ["economy", "governance"], description: "Macroeconomics, growth, public policy; strong link to Korean government." },
  { name: "China Institutes of Contemporary International Relations (CICIR)", slug: "cicir", country: "China", region: "Asia", website: "https://www.cicir.ac.cn/", feedUrl: "https://news.google.com/rss/search?q=site:cicir.ac.cn&hl=en-US&gl=US&ceid=US:en", feedType: "RSS", tier: "A+", clusters: ["security", "china-asia"], description: "Chinese security and foreign affairs; institute close to the foreign-policy structure." },
  { name: "China Institute of International Studies (CIIS)", slug: "ciis", country: "China", region: "Asia", website: "https://www.ciis.org.cn/english/", feedUrl: "https://news.google.com/rss/search?q=site:ciis.org.cn&hl=en-US&gl=US&ceid=US:en", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "china-asia"], description: "Chinese foreign policy, international organizations, great-power relations." },
  { name: "Mercator Institute for China Studies (MERICS)", slug: "merics", country: "Germany", region: "Europe", website: "https://merics.org/", feedUrl: "https://merics.org/en/rss.xml", feedType: "RSS", tier: "A+", clusters: ["china-asia", "tech", "economy"], description: "China tech, economy, geopolitics; Europe's China reference." },
  { name: "Rajaratnam School of International Studies (RSIS)", slug: "rsis", country: "Singapore", region: "Asia", website: "https://rsis.edu.sg/", feedUrl: "https://www.rsis.edu.sg/rss", feedType: "RSS", tier: "A+", clusters: ["security", "china-asia"], description: "Asian security, terrorism, defense; leading Southeast Asia voice." },
  { name: "ISEAS – Yusof Ishak Institute", slug: "iseas", country: "Singapore", region: "Asia", website: "https://www.iseas.edu.sg/", feedUrl: "https://www.iseas.edu.sg/rss", feedType: "RSS", tier: "A", clusters: ["china-asia", "economy"], description: "ASEAN, Southeast Asian economics and politics." },
  { name: "Lowy Institute", slug: "lowy", country: "Australia", region: "Oceania", website: "https://www.lowyinstitute.org/", feedUrl: "https://www.lowyinstitute.org/rss.xml", feedType: "RSS", tier: "A+", clusters: ["foreign-policy", "china-asia", "security"], description: "Indo-Pacific, regional power, China; powerful data and polling (Asia Power Index)." },
  { name: "National Bureau of Asian Research (NBR)", slug: "nbr", country: "United States", region: "North America", website: "https://www.nbr.org/", feedUrl: "https://www.nbr.org/feed/", feedType: "RSS", tier: "A", clusters: ["china-asia", "security", "energy"], description: "Asia, China, Korea, Japan, energy, security." },
  { name: "Asia Society Policy Institute (ASPI)", slug: "aspi", country: "United States", region: "North America", website: "https://asiasociety.org/policy-institute", feedUrl: "https://asiasociety.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["china-asia", "foreign-policy", "tech"], description: "Asia, China, technology, economy, security." },
  { name: "East Asia Institute (EAI)", slug: "eai", country: "South Korea", region: "Asia", website: "https://www.eai.or.kr/new/en/", feedUrl: "https://www.eai.or.kr/rss.xml", feedType: "RSS", tier: "A", clusters: ["china-asia", "foreign-policy", "security"], description: "East Asian regional order and security." },
  { name: "Sasakawa Peace Foundation", slug: "spf", country: "Japan", region: "Asia", website: "https://www.spf.org/en/", feedUrl: "https://www.spf.org/en/rss.xml", feedType: "RSS", tier: "A", clusters: ["security", "china-asia", "energy"], description: "Security, peace, energy, South and Southeast Asia programs." },
  { name: "Institute for National Defense and Security Research (INDSR)", slug: "indsr", country: "Taiwan", region: "Asia", website: "https://indsr.org.tw/en/", feedUrl: "https://news.google.com/rss/search?q=site:indsr.org.tw&hl=en-US&gl=US&ceid=US:en", feedType: "RSS", tier: "A", clusters: ["security", "china-asia"], description: "Defense, China, Taiwan security, regional geopolitics." },
  { name: "Takshashila Institution", slug: "takshashila", country: "India", region: "Asia", website: "https://takshashila.org.in/", feedUrl: "https://takshashila.org.in/feed/", feedType: "RSS", tier: "A", clusters: ["tech", "security", "foreign-policy"], description: "Technology, defense, geopolitics, policy education." },
  { name: "Carnegie India", slug: "carnegie-india", country: "India", region: "Asia", website: "https://carnegieindia.org/", feedUrl: "https://carnegieindia.org/rss/solr/?lang=en", feedType: "RSS", tier: "A", clusters: ["china-asia", "tech", "foreign-policy"], description: "China, technology, energy, India's role in the global order." },
  { name: "Center for Study of Science, Technology and Policy (CSTEP)", slug: "cstep", country: "India", region: "Asia", website: "https://cstep.in/", feedUrl: "https://cstep.in/feed/", feedType: "RSS", tier: "B+", clusters: ["energy", "tech"], description: "Energy, climate, technology; model-based public policy." },
  { name: "Carnegie Middle East Center", slug: "carnegie-mec", country: "Lebanon", region: "Middle East", website: "https://carnegie-mec.org/", feedUrl: "https://carnegie-mec.org/rss/solr/?lang=en", feedType: "RSS", tier: "A+", clusters: ["iran-mideast", "foreign-policy"], description: "Middle East political economy, Syria, Iran, regional order." },
  { name: "Institute for National Security Studies (INSS)", slug: "inss", country: "Israel", region: "Middle East", website: "https://www.inss.org.il/", feedUrl: "https://www.inss.org.il/feed/", feedType: "RSS", tier: "A+", clusters: ["iran-mideast", "security"], description: "Israeli national security, Iran, nuclear, war, regional policy." },
  { name: "Gulf Research Center (GRC)", slug: "grc", country: "Saudi Arabia / Gulf", region: "Middle East", website: "https://www.grc.net/", feedUrl: "https://www.grc.net/rss.xml", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "energy", "security"], description: "Gulf, energy, regional security, great-power relations." },
  { name: "Emirates Policy Center (EPC)", slug: "epc-uae", country: "United Arab Emirates", region: "Middle East", website: "https://epc.ae/", feedUrl: "https://epc.ae/rss.xml", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "security"], description: "Gulf security, Iran, Arab regional geopolitics." },
  { name: "TRENDS Research & Advisory", slug: "trends", country: "United Arab Emirates", region: "Middle East", website: "https://trendsresearch.org/", feedUrl: "https://trendsresearch.org/feed/", feedType: "RSS", tier: "B+", clusters: ["security", "tech"], description: "Geopolitics, security, extremism, technology, foresight." },
  { name: "Al-Ahram Center for Political and Strategic Studies", slug: "ahram-acpss", country: "Egypt", region: "Middle East", website: "https://acpss.ahram.org.eg/", feedUrl: "https://acpss.ahram.org.eg/rss.xml", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "foreign-policy"], description: "Egyptian politics, Arab world, regional security." },
  { name: "Egyptian Center for Economic Studies (ECES)", slug: "eces", country: "Egypt", region: "Middle East", website: "https://eces.org.eg/", feedUrl: "https://eces.org.eg/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy"], description: "Economy, structural reform, Egyptian economic policy." },
  { name: "Arab Reform Initiative (ARI)", slug: "ari", country: "France / Arab world", region: "Middle East", website: "https://www.arab-reform.net/", feedUrl: "https://www.arab-reform.net/en/feed/", feedType: "RSS", tier: "A", clusters: ["governance", "iran-mideast"], description: "Governance, reform, political transition, Arab social policy." },
  { name: "Arab Center Washington DC", slug: "arab-center", country: "United States", region: "North America", website: "https://arabcenterdc.org/", feedUrl: "https://arabcenterdc.org/feed/", feedType: "RSS", tier: "A", clusters: ["iran-mideast", "foreign-policy"], description: "Arab policy, Gulf, Iran, US–Middle East relations." },
  { name: "Al-Shabaka: The Palestinian Policy Network", slug: "al-shabaka", country: "Palestine / US", region: "Middle East", website: "https://al-shabaka.org/", feedUrl: "https://al-shabaka.org/feed/", feedType: "RSS", tier: "B+", clusters: ["iran-mideast", "governance"], description: "Palestine, international law, civil society, regional policy." },
  { name: "Pal-Think for Strategic Studies", slug: "palthink", country: "Palestine", region: "Middle East", website: "https://www.palthink.org/", feedUrl: "https://www.palthink.org/rss.xml", feedType: "RSS", tier: "B+", clusters: ["iran-mideast"], description: "Foresight, scenarios, Palestinian policy." },
  { name: "Lebanese Center for Policy Studies (LCPS)", slug: "lcps", country: "Lebanon", region: "Middle East", website: "https://www.lcps-lebanon.org/", feedUrl: "https://www.lcps-lebanon.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["governance", "iran-mideast"], description: "Governance, political economy, Lebanese public policy." },
  { name: "Rasanah: International Institute for Iranian Studies", slug: "rasanah", country: "Saudi Arabia", region: "Middle East", website: "https://rasanah-iiis.org/", feedUrl: "https://rasanah-iiis.org/en/feed/", feedType: "RSS", tier: "A", clusters: ["iran-mideast"], description: "Iran, domestic politics, security, regional relations." },
  { name: "iNNOV8 Research Center", slug: "innov8", country: "Iraq", region: "Middle East", website: "https://innov8.channel8.com/", feedUrl: "https://innov8.channel8.com/rss.xml", feedType: "RSS", tier: "B+", clusters: ["security", "governance"], description: "Public policy, technology, security; Iraq/Kurdistan policy." },
  { name: "Institute for Security Studies (ISS Africa)", slug: "issafrica", country: "South Africa / Africa", region: "Africa", website: "https://issafrica.org/", feedUrl: "https://issafrica.org/rss.xml", feedType: "RSS", tier: "A+", clusters: ["security", "governance", "africa-global-south"], description: "Security, crime, governance, peace in Africa." },
  { name: "South African Institute of International Affairs (SAIIA)", slug: "saiia", country: "South Africa", region: "Africa", website: "https://saiia.org.za/", feedUrl: "https://saiia.org.za/rss.xml", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "energy", "africa-global-south"], description: "African foreign policy, G20, energy, governance." },
  { name: "African Center for Economic Transformation (ACET)", slug: "acet", country: "Ghana / Africa", region: "Africa", website: "https://acetforafrica.org/", feedUrl: "https://acetforafrica.org/feed/", feedType: "RSS", tier: "A", clusters: ["economy", "africa-global-south"], description: "Development, industrialization, African economic policy." },
  { name: "Fundação Getulio Vargas (FGV)", slug: "fgv", country: "Brazil", region: "Latin America", website: "https://portal.fgv.br/en", feedUrl: "https://portal.fgv.br/en/rss.xml", feedType: "RSS", tier: "A+", clusters: ["economy", "governance", "africa-global-south"], description: "Economics, governance, public policy; a leading Global South center." },
  { name: "CIPPEC", slug: "cippec", country: "Argentina", region: "Latin America", website: "https://www.cippec.org/", feedUrl: "https://www.cippec.org/feed/", feedType: "RSS", tier: "A", clusters: ["governance", "economy", "africa-global-south"], description: "Public policy, development, state capacity in Argentina." },
  { name: "Fedesarrollo", slug: "fedesarrollo", country: "Colombia", region: "Latin America", website: "https://www.fedesarrollo.org.co/", feedUrl: "https://www.fedesarrollo.org.co/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "governance"], description: "Economics, development, Colombian and Latin American policy." },
  { name: "GRADE – Grupo de Análisis para el Desarrollo", slug: "grade", country: "Peru", region: "Latin America", website: "https://www.grade.org.pe/", feedUrl: "https://www.grade.org.pe/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "governance"], description: "Development economics, poverty, education, social policy." },
  { name: "CEBRI – Brazilian Center for International Relations", slug: "cebri", country: "Brazil", region: "Latin America", website: "https://cebri.org/", feedUrl: "https://cebri.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "economy", "africa-global-south"], description: "Brazilian foreign relations, trade, geopolitics." },
  { name: "FLACSO – Latin American Faculty of Social Sciences", slug: "flacso", country: "Latin America", region: "Latin America", website: "https://www.flacso.org/", feedUrl: "https://www.flacso.org/rss.xml", feedType: "RSS", tier: "A", clusters: ["governance", "africa-global-south"], description: "Social sciences, governance, development, regional IR." },
  { name: "CEDICE Libertad", slug: "cedice", country: "Venezuela", region: "Latin America", website: "https://cedice.org.ve/", feedUrl: "https://cedice.org.ve/feed/", feedType: "RSS", tier: "B+", clusters: ["economy"], description: "Market economics, economic liberty, policy reform." },
  { name: "Razumkov Centre", slug: "razumkov", country: "Ukraine", region: "Europe", website: "https://razumkov.org.ua/", feedUrl: "https://razumkov.org.ua/en/rss", feedType: "RSS", tier: "A", clusters: ["security", "foreign-policy", "governance"], description: "Ukrainian security, foreign policy, economy, public opinion." },
  { name: "OSW – Centre for Eastern Studies", slug: "osw", country: "Poland", region: "Europe", website: "https://www.osw.waw.pl/en", feedUrl: "https://www.osw.waw.pl/en/rss", feedType: "RSS", tier: "A", clusters: ["security", "foreign-policy", "china-asia"], description: "Russia, Ukraine, Eastern Europe, Belarus, Caucasus." },
  { name: "Polish Institute of International Affairs (PISM)", slug: "pism", country: "Poland", region: "Europe", website: "https://www.pism.pl/", feedUrl: "https://www.pism.pl/en/rss", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "security"], description: "Polish foreign policy, NATO, Russia, Europe, security." },
  { name: "European Policy Institute – Skopje", slug: "epi-skopje", country: "North Macedonia", region: "Europe", website: "https://epi.org.mk/", feedUrl: "https://epi.org.mk/rss.xml", feedType: "RSS", tier: "B+", clusters: ["governance", "economy"], description: "EU accession, governance, reforms." },
  { name: "Institute for Strategic and Regional Studies (ISRS)", slug: "isrs", country: "Uzbekistan", region: "Asia", website: "https://isrs.uz/", feedUrl: "https://isrs.uz/en/rss", feedType: "RSS", tier: "A", clusters: ["security", "foreign-policy"], description: "Uzbek and Central Asian foreign and strategic policy." },
  { name: "CAPS Unlock", slug: "caps-unlock", country: "Kazakhstan", region: "Asia", website: "https://capsunlock.org/", feedUrl: "https://capsunlock.org/feed/", feedType: "RSS", tier: "B+", clusters: ["governance", "economy"], description: "Civil society, political economy, Central Asian governance." },
  { name: "Center for Economic and Social Development (CESD)", slug: "cesd", country: "Azerbaijan", region: "Asia", website: "https://cesd.az/", feedUrl: "https://cesd.az/rss.xml", feedType: "RSS", tier: "B+", clusters: ["economy", "energy"], description: "Economy, energy, development; national and regional influence." },
  { name: "AIR Center – Center of Analysis of International Relations", slug: "air-center", country: "Azerbaijan", region: "Asia", website: "https://aircenter.az/", feedUrl: "https://aircenter.az/en/rss", feedType: "RSS", tier: "B+", clusters: ["foreign-policy", "security"], description: "Caucasus, foreign policy, security, regional relations." },
  { name: "Institute for Foreign Affairs and National Security (IFANS)", slug: "ifans", country: "South Korea", region: "Asia", website: "https://www.knda.go.kr/", feedUrl: "https://www.knda.go.kr/rss.xml", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "security", "china-asia"], description: "Korean diplomacy and foreign policy (National Diplomatic Academy)." },
  { name: "Korea Institute for International Economic Policy (KIEP)", slug: "kiep", country: "South Korea", region: "Asia", website: "https://www.kiep.go.kr/eng/", feedUrl: "https://www.kiep.go.kr/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "china-asia"], description: "International economics, trade, East Asian economic policy." },
  { name: "Research Institute of Economy, Trade and Industry (RIETI)", slug: "rieti", country: "Japan", region: "Asia", website: "https://www.rieti.go.jp/en/", feedUrl: "https://www.rieti.go.jp/en/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "tech"], description: "Economics, industry, trade, Japanese economic policy." },
  { name: "Institute of Developing Economies – JETRO (IDE-JETRO)", slug: "ide-jetro", country: "Japan", region: "Asia", website: "https://www.ide.go.jp/English/", feedUrl: "https://www.ide.go.jp/English/rss.xml", feedType: "RSS", tier: "A", clusters: ["economy", "africa-global-south", "china-asia"], description: "Development, Asian economies, Global South." },
  { name: "Gaidar Institute for Economic Policy", slug: "gaidar", country: "Russia", region: "Europe", website: "https://www.iep.ru/en/", feedUrl: "https://www.iep.ru/en/rss", feedType: "RSS", tier: "A", clusters: ["economy"], description: "Russian economy and economic policy; academic-policy influence in Russia." },
  { name: "Development Research Center of the State Council (DRC)", slug: "drc", country: "China", region: "Asia", website: "https://en.drc.gov.cn/", feedUrl: "https://news.google.com/rss/search?q=site:en.drc.gov.cn&hl=en-US&gl=US&ceid=US:en", feedType: "RSS", tier: "A", clusters: ["economy", "governance", "china-asia"], description: "Chinese development economics; advises the State Council." },
  { name: "China Center for International Economic and Technological Exchange", slug: "cciet", country: "China", region: "Asia", website: "https://www.cciet.gov.cn/", feedUrl: "https://news.google.com/rss/search?q=site:cciet.gov.cn&hl=en-US&gl=US&ceid=US:en", feedType: "RSS", tier: "B+", clusters: ["economy", "tech"], description: "Economy, technology, Chinese international cooperation." },
  { name: "International Centre for the Study of Radicalisation (ICSR)", slug: "icsr", country: "United Kingdom", region: "Europe", website: "https://icsr.info/", feedUrl: "https://icsr.info/feed", feedType: "RSS", tier: "B+", clusters: ["security"], description: "Terrorism, extremism, threat analysis." },
  { name: "European Leadership Network (ELN)", slug: "eln", country: "Europe", region: "Europe", website: "https://www.europeanleadershipnetwork.org/", feedUrl: "https://www.europeanleadershipnetwork.org/feed/", feedType: "RSS", tier: "B+", clusters: ["security", "foreign-policy"], description: "Nuclear, European security, strategic dialogues." },
  { name: "Chicago Council on Global Affairs", slug: "chicago-council", country: "United States", region: "North America", website: "https://globalaffairs.org/", feedUrl: "https://globalaffairs.org/feed/", feedType: "RSS", tier: "A", clusters: ["foreign-policy", "governance"], description: "US foreign policy, public opinion surveys." },
  { name: "Council on Economic Policies (CEP)", slug: "cep", country: "Switzerland", region: "Europe", website: "https://www.cepweb.org/", feedUrl: "https://www.cepweb.org/feed/", feedType: "RSS", tier: "A", clusters: ["economy", "energy"], description: "Climate economics, public finance, green policy." },
  { name: "Resolution Foundation", slug: "resolution-foundation", country: "United Kingdom", region: "Europe", website: "https://www.resolutionfoundation.org/", feedUrl: "https://www.resolutionfoundation.org/feed/", feedType: "RSS", tier: "A", clusters: ["economy", "governance"], description: "Wages, inequality, growth, tax, welfare." },
  { name: "Norwegian Institute of International Affairs (NUPI) – Security & Defence", slug: "nupi-security", country: "Norway", region: "Europe", website: "https://www.nupi.no/en", feedUrl: "https://www.nupi.no/en/rss", feedType: "RSS", tier: "B+", clusters: ["security"], description: "Security and defence research feed (NUPI)." },
];

/** Topic clusters used for grouped monitoring. */
export const CLUSTERS = [
  { slug: "security", label: "Security & Defense" },
  { slug: "foreign-policy", label: "Foreign Policy & Diplomacy" },
  { slug: "iran-mideast", label: "Iran & Middle East" },
  { slug: "china-asia", label: "China & Asia" },
  { slug: "economy", label: "Global Economy, Trade & Sanctions" },
  { slug: "energy", label: "Energy & Climate" },
  { slug: "africa-global-south", label: "Africa & Global South" },
  { slug: "tech", label: "Technology & Futures" },
  { slug: "governance", label: "Governance & Development" },
] as const;

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("thinkTanks").collect();
    if (existing.length > 0) return { seeded: false, reason: "already_populated" };
    for (const t of TANKS) {
      await ctx.db.insert("thinkTanks", {
        name: t.name,
        slug: t.slug,
        country: t.country,
        region: t.region,
        website: t.website,
        feedUrl: t.feedUrl,
        feedType: t.feedType,
        enabled: true,
        tier: t.tier,
        clusters: t.clusters,
        lastFetched: undefined,
        description: t.description,
      });
    }
    return { seeded: true, count: TANKS.length };
  },
});

// Idempotent registry migration: inserts missing tanks and refreshes metadata
// (tier, clusters, website, feed URLs) for existing slugs. Safe to run anytime;
// preserves lastFetched so feeds are not re-throttled.
export const syncRegistry = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("thinkTanks").collect();
    const bySlug = new Map(existing.map((t) => [t.slug, t]));

    let inserted = 0;
    let updated = 0;

    for (const t of TANKS) {
      const row = bySlug.get(t.slug);
      if (!row) {
        await ctx.db.insert("thinkTanks", {
          name: t.name,
          slug: t.slug,
          country: t.country,
          region: t.region,
          website: t.website,
          feedUrl: t.feedUrl,
          feedType: t.feedType,
          enabled: true,
          tier: t.tier,
          clusters: t.clusters,
          lastFetched: undefined,
          description: t.description,
        });
        inserted++;
      } else {
        await ctx.db.patch(row._id, {
          name: t.name,
          website: t.website,
          tier: t.tier,
          clusters: t.clusters,
          description: t.description,
        });
        updated++;
      }
    }

    return { inserted, updated, total: TANKS.length };
  },
});

