// Simulated B2B database backing the demo lead pool.
// Structured per-industry so the nl-to-filters engine can match campaigns
// against industries, titles, geographies and company sizes.

export interface SeedCompany {
  name: string
  domain: string
  industry: string
  size: string
  country: string
  city: string
}

export interface SeedPersonTpl {
  title: string
  seniority: number // 3 = founder/C-level, 2 = director/VP, 1 = manager/head-of
}

export const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"]

export const INDUSTRY_HOOKS: Record<string, string[]> = {
  "Dental Clinics": [
    "just opened a second location",
    "running Google Ads with no follow-up system",
    "pending hygiene recall backlog",
    "hiring an associate dentist",
  ],
  "Med Spas & Aesthetics": [
    "launching a membership plan next quarter",
    "booked out 6 weeks for injectables",
    "adding a third treatment room",
    "spending heavily on Instagram ads",
  ],
  "Law Firms": [
    "expanding the personal injury practice",
    "hiring two paralegals",
    "opening a satellite office",
    "caseload up 40% this year",
  ],
  "Accounting Firms": [
    "onboarding 30 new clients this quarter",
    "nearing tax season capacity",
    "adding advisory services",
    "losing staff to Big Four",
  ],
  "SaaS": [
    "just closed a seed round",
    "hiring 3 AEs this quarter",
    "churn crept up to 3.2% monthly",
    "expanding into the EU market",
    "launching a usage-based pricing tier",
  ],
  "E-commerce Brands": [
    "scaling paid social spend 2x",
    "launching on Amazon EU",
    "repeat purchase rate declining",
    "adding a subscription box line",
  ],
  "Marketing Agencies": [
    "won three retainer clients last month",
    "needs more senior media buyers",
    "narrowing to a performance niche",
    "client roster at 14 and growing",
  ],
  "IT & Managed Services": [
    "won a 200-seat managed contract",
    "expanding co-managed IT offerings",
    "security practice growing fast",
    "hiring level-3 engineers",
  ],
  "Logistics & Freight": [
    "adding cross-border lanes",
    "fleet expansion planned for Q3",
    "opening a new warehouse",
    "lost a major 3PL contract to price",
  ],
  "Manufacturing": [
    "reshoring production lines",
    "tooling capacity nearly maxed",
    "certifying for aerospace contracts",
    "adding a second shift",
  ],
  "Real Estate Agencies": [
    "expanding into luxury listings",
    "agent count doubled this year",
    "launching a property management arm",
    "market share up in the metro area",
  ],
  "Fitness & Gyms": [
    "opening locations 4 and 5",
    "corporate wellness contracts in pipeline",
    "member churn above 6%",
    "adding recovery and sauna amenities",
  ],
  "Financial Services": [
    "launching an SMB lending product",
    "AUM crossed the $200M mark",
    "compliance team scaling up",
    "opening a branch network",
  ],
  "Construction & Trades": [
    "booked out through next summer",
    "bidding on municipal contracts",
    "adding a commercial division",
    "crew shortage limiting growth",
  ],
  "Veterinary Clinics": [
    "building a third exam suite",
    "vet tech turnover is brutal",
    "corporate consolidation interest",
    "after-hours demand unmet",
  ],
}

export const SEED_COMPANIES: SeedCompany[] = [
  // Dental
  { name: "Brightline Dental Group", domain: "brightlinedental.com", industry: "Dental Clinics", size: "11-50", country: "United States", city: "Austin" },
  { name: "Pearl & Co Dentistry", domain: "pearlandco.dental", industry: "Dental Clinics", size: "1-10", country: "United States", city: "Denver" },
  { name: "Northgate Dental Care", domain: "northgatedental.co.uk", industry: "Dental Clinics", size: "51-200", country: "United Kingdom", city: "Manchester" },
  { name: "SmileLab Clinics", domain: "smilelab.no", industry: "Dental Clinics", size: "11-50", country: "Norway", city: "Oslo" },
  { name: "Rivermont Orthodontics", domain: "rivermontortho.com", industry: "Dental Clinics", size: "1-10", country: "Canada", city: "Toronto" },
  // Med spas
  { name: "Lumen Aesthetics", domain: "lumenaesthetics.com", industry: "Med Spas & Aesthetics", size: "11-50", country: "United States", city: "Miami" },
  { name: "Velvet Skin Studios", domain: "velvetskin.com.au", industry: "Med Spas & Aesthetics", size: "1-10", country: "Australia", city: "Sydney" },
  { name: "Aurum Medspa", domain: "aurummedspa.com", industry: "Med Spas & Aesthetics", size: "51-200", country: "United States", city: "Dallas" },
  { name: "Cala Derma Institute", domain: "caladerma.ae", industry: "Med Spas & Aesthetics", size: "11-50", country: "UAE", city: "Dubai" },
  // Law
  { name: "Harrow & Vance LLP", domain: "harrowvance.law", industry: "Law Firms", size: "51-200", country: "United States", city: "Chicago" },
  { name: "Kestrel Legal Group", domain: "kestrellegal.co.uk", industry: "Law Firms", size: "11-50", country: "United Kingdom", city: "Birmingham" },
  { name: "Merritt Injury Law", domain: "merrittinjury.com", industry: "Law Firms", size: "1-10", country: "United States", city: "Phoenix" },
  { name: "Alderway Solicitors", domain: "alderway.legal", industry: "Law Firms", size: "51-200", country: "Australia", city: "Melbourne" },
  // Accounting
  { name: "Ledgerline Advisory", domain: "ledgerline.cpa", industry: "Accounting Firms", size: "11-50", country: "United States", city: "Atlanta" },
  { name: "Quinn Bookkeeping Co", domain: "quinnbooks.ca", industry: "Accounting Firms", size: "1-10", country: "Canada", city: "Vancouver" },
  { name: "Fairmont Tax Partners", domain: "fairmonttax.com", industry: "Accounting Firms", size: "51-200", country: "United States", city: "New Jersey" },
  { name: "Blakely & Sons Accounting", domain: "blakelysons.co.uk", industry: "Accounting Firms", size: "11-50", country: "United Kingdom", city: "Leeds" },
  // SaaS
  { name: "Flowstack", domain: "flowstack.io", industry: "SaaS", size: "11-50", country: "United States", city: "San Francisco" },
  { name: "Queuebird", domain: "queuebird.app", industry: "SaaS", size: "1-10", country: "United States", city: "Boulder" },
  { name: "RelayCRM", domain: "relaycrm.com", industry: "SaaS", size: "51-200", country: "Canada", city: "Toronto" },
  { name: "Inkwell Docs", domain: "inkwelldocs.com", industry: "SaaS", size: "11-50", country: "Germany", city: "Berlin" },
  { name: "Signalpost", domain: "signalpost.io", industry: "SaaS", size: "51-200", country: "United States", city: "New York" },
  { name: "Draftpilot", domain: "draftpilot.ai", industry: "SaaS", size: "1-10", country: "Singapore", city: "Singapore" },
  { name: "Hexlane Analytics", domain: "hexlane.com", industry: "SaaS", size: "201-500", country: "United States", city: "Seattle" },
  // E-commerce
  { name: "Copperfield Goods", domain: "copperfieldgoods.com", industry: "E-commerce Brands", size: "11-50", country: "United States", city: "Portland" },
  { name: "Bloomcart", domain: "bloomcart.shop", industry: "E-commerce Brands", size: "51-200", country: "Netherlands", city: "Amsterdam" },
  { name: "Tundra Outfitters", domain: "tundraoutfitters.com", industry: "E-commerce Brands", size: "201-500", country: "Canada", city: "Calgary" },
  { name: "Petit Maison Home", domain: "petitmaison.fr", industry: "E-commerce Brands", size: "11-50", country: "France", city: "Lyon" },
  { name: "Gearhound", domain: "gearhound.co", industry: "E-commerce Brands", size: "11-50", country: "United Kingdom", city: "Bristol" },
  // Marketing agencies
  { name: "Tidal & Co Media", domain: "tidalandco.com", industry: "Marketing Agencies", size: "11-50", country: "United States", city: "Nashville" },
  { name: "Foundry Growth Partners", domain: "foundrygrowth.com", industry: "Marketing Agencies", size: "51-200", country: "United States", city: "Chicago" },
  { name: "Ember Digital", domain: "emberdigital.ae", industry: "Marketing Agencies", size: "11-50", country: "UAE", city: "Dubai" },
  { name: "Wharf Creative", domain: "wharfcreative.co.uk", industry: "Marketing Agencies", size: "1-10", country: "United Kingdom", city: "London" },
  { name: "Basalt Performance", domain: "basaltperformance.de", industry: "Marketing Agencies", size: "11-50", country: "Germany", city: "Munich" },
  // IT & MSP
  { name: "Netcrag Managed IT", domain: "netcrag.com", industry: "IT & Managed Services", size: "51-200", country: "United States", city: "Columbus" },
  { name: "Shieldwall IT", domain: "shieldwallit.com", industry: "IT & Managed Services", size: "11-50", country: "United States", city: "Denver" },
  { name: "InfraQuay", domain: "infraquay.co.uk", industry: "IT & Managed Services", size: "51-200", country: "United Kingdom", city: "London" },
  { name: "Cortex Systems", domain: "cortexsystems.ca", industry: "IT & Managed Services", size: "11-50", country: "Canada", city: "Ottawa" },
  // Logistics
  { name: "Freightline Logistics", domain: "freightline.io", industry: "Logistics & Freight", size: "201-500", country: "United States", city: "Memphis" },
  { name: "Polar Lane Carriers", domain: "polarlane.fi", industry: "Logistics & Freight", size: "51-200", country: "Finland", city: "Helsinki" },
  { name: "Harbor & Crate", domain: "harborcrate.com", industry: "Logistics & Freight", size: "51-200", country: "United States", city: "Long Beach" },
  { name: "SwiftHaul Transport", domain: "swifthaul.com.au", industry: "Logistics & Freight", size: "201-500", country: "Australia", city: "Brisbane" },
  // Manufacturing
  { name: "Ironvale Fabrication", domain: "ironvale.com", industry: "Manufacturing", size: "201-500", country: "United States", city: "Cleveland" },
  { name: "Nordwerk Machining", domain: "nordwerk.de", industry: "Manufacturing", size: "201-500", country: "Germany", city: "Stuttgart" },
  { name: "Camber Tooling", domain: "cambertooling.com", industry: "Manufacturing", size: "51-200", country: "United States", city: "Detroit" },
  { name: "ArcBridge Plastics", domain: "arcbridge.pl", industry: "Manufacturing", size: "51-200", country: "Poland", city: "Krakow" },
  // Real estate
  { name: "Meridian Realty Group", domain: "meridianrealty.com", industry: "Real Estate Agencies", size: "51-200", country: "United States", city: "Naples" },
  { name: "Stonebridge Estates", domain: "stonebridgeestates.co.uk", industry: "Real Estate Agencies", size: "11-50", country: "United Kingdom", city: "Guildford" },
  { name: "Crestpoint Properties", domain: "crestpoint.ae", industry: "Real Estate Agencies", size: "201-500", country: "UAE", city: "Dubai" },
  { name: "Lakeview Realty Co", domain: "lakeviewrealty.ca", industry: "Real Estate Agencies", size: "11-50", country: "Canada", city: "Toronto" },
  // Fitness
  { name: "Forge Fitness Studios", domain: "forgefitness.com", industry: "Fitness & Gyms", size: "11-50", country: "United States", city: "Austin" },
  { name: "Ascend Climbing Gyms", domain: "ascendclimb.co.uk", industry: "Fitness & Gyms", size: "11-50", country: "United Kingdom", city: "Sheffield" },
  { name: "PulseRow Athletics", domain: "pulserowfit.com", industry: "Fitness & Gyms", size: "1-10", country: "United States", city: "Boston" },
  { name: "Kinetic Club", domain: "kineticclub.sg", industry: "Fitness & Gyms", size: "11-50", country: "Singapore", city: "Singapore" },
  // Financial services
  { name: "Cardinal Ridge Capital", domain: "cardinalridge.com", industry: "Financial Services", size: "11-50", country: "United States", city: "Charlotte" },
  { name: "Fairbank Lending", domain: "fairbanklending.com", industry: "Financial Services", size: "201-500", country: "United States", city: "Salt Lake City" },
  { name: "Oakmere Wealth", domain: "oakmerewealth.co.uk", industry: "Financial Services", size: "51-200", country: "United Kingdom", city: "Bristol" },
  { name: "Sable & Finch Insurance", domain: "sablefinch.com", industry: "Financial Services", size: "51-200", country: "Canada", city: "Toronto" },
  // Construction
  { name: "Redstone Builders", domain: "redstonebuilders.com", industry: "Construction & Trades", size: "201-500", country: "United States", city: "Houston" },
  { name: "Trowell & Crane", domain: "trowellcrane.co.uk", industry: "Construction & Trades", size: "51-200", country: "United Kingdom", city: "Nottingham" },
  { name: "Summitform Roofing", domain: "summitform.com", industry: "Construction & Trades", size: "51-200", country: "United States", city: "Phoenix" },
  { name: "Gridstone Electrical", domain: "gridstone.us", industry: "Construction & Trades", size: "11-50", country: "United States", city: "Minneapolis" },
  // Veterinary
  { name: "Willow Creek Vet Hospitals", domain: "willowcreekvet.com", industry: "Veterinary Clinics", size: "51-200", country: "United States", city: "Raleigh" },
  { name: "Pawsome Polyclinic", domain: "pawsome.sg", industry: "Veterinary Clinics", size: "11-50", country: "Singapore", city: "Singapore" },
  { name: "Harborview Animal Care", domain: "harborviewvet.com", industry: "Veterinary Clinics", size: "11-50", country: "United States", city: "Seattle" },
  { name: "Fernfield Vets", domain: "fernfieldvets.co.nz", industry: "Veterinary Clinics", size: "1-10", country: "New Zealand", city: "Auckland" },
]

export const TITLE_TPLS: SeedPersonTpl[] = [
  { title: "Founder & CEO", seniority: 3 },
  { title: "CEO", seniority: 3 },
  { title: "Co-Founder", seniority: 3 },
  { title: "Owner", seniority: 3 },
  { title: "Managing Director", seniority: 3 },
  { title: "Chief Operating Officer", seniority: 3 },
  { title: "VP of Sales", seniority: 2 },
  { title: "Sales Director", seniority: 2 },
  { title: "Marketing Director", seniority: 2 },
  { title: "Head of Growth", seniority: 2 },
  { title: "Chief Marketing Officer", seniority: 3 },
  { title: "Head of Marketing", seniority: 1 },
  { title: "Operations Manager", seniority: 1 },
  { title: "Practice Manager", seniority: 1 },
  { title: "General Manager", seniority: 2 },
  { title: "Business Development Manager", seniority: 1 },
]

export const FIRST_NAMES = ["James", "Sarah", "Michael", "Emma", "David", "Laura", "Daniel", "Rachel", "Tom", "Anna", "Marcus", "Sophie", "Alex", "Nina", "Ryan", "Kate", "Ben", "Julia", "Sam", "Grace", "Oliver", "Maya", "Chris", "Elena", "Jack", "Priya", "Leo", "Hannah", "Max", "Iris", "Peter", "Chloe", "Victor", "Amelia", "Nathan", "Zoe"]
export const LAST_NAMES = ["Carter", "Bennett", "Harlow", "Morgan", "Foster", "Reed", "Sullivan", "Brooks", "Whitfield", "Lawson", "Mercer", "Delgado", "Novak", "Ferreira", "Okafor", "Lindqvist", "Marsh", "Keller", "Nakamura", "Alderton", "Vance", "Huang", "Radic", "Ellis", "Moreau", "Grant", "Bassett", "Iverson", "Delaney", "Calloway"]
