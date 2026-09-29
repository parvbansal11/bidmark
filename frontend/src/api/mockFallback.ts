import type { Tender, Bidder } from '@/types'

export const MOCK_USER_OFFICER = {
  id: 'usr_officer_01',
  email: 'officer@cpcl.gov.in',
  full_name: 'Rajesh Sharma',
  role: 'PROCUREMENT_OFFICER',
  department: 'Chennai Petroleum Corporation Limited (CPCL)',
  organization: 'Ministry of Petroleum & Natural Gas',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const MOCK_USER_ADMIN = {
  id: 'usr_admin_01',
  email: 'admin@cpcl.gov.in',
  full_name: 'Priya Sundaram',
  role: 'ADMIN',
  department: 'Chennai Petroleum Corporation Limited (CPCL)',
  organization: 'Ministry of Petroleum & Natural Gas',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const MOCK_USER_BIDDER = {
  id: 'usr_bidder_01',
  email: 'contact@alphaenergy.in',
  full_name: 'Vikram Mehta',
  role: 'BIDDER',
  department: 'Vendor Portal',
  organization: 'Alpha Energy Solutions Ltd.',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const MOCK_TENDERS: Tender[] = [
  {
    id: 'tnd_101',
    tender_number: 'CPCL/GEM/2026/104',
    gem_tender_id: 'GEM/2026/B/7891234',
    custom_tender_id: 'CPCL-VALVE-2026',
    title: 'Supply of High-Pressure Industrial Valve Actuators',
    department: 'Chennai Petroleum Corporation Limited (CPCL)',
    organization: 'Ministry of Petroleum & Natural Gas',
    description: 'Procurement of API 6D certified high-pressure ball valve actuators for Manali Refinery Expansion Project.',
    estimated_value: 12500000,
    published_at: '2026-09-01T10:00:00Z',
    deadline: '2026-09-25T17:00:00Z',
    status: 'ACTIVE',
    tender_type: 'OPEN_TENDER',
    tender_category: 'GOODS',
    tender_mode: 'ONLINE',
    bid_system: 'TWO_PACKET',
    location: 'Chennai, Tamil Nadu',
    bid_validity_days: 90,
    is_flagged: false,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    requirements: [
      { id: 'req_1', tender_id: 'tnd_101', requirement_type: 'GST', description: 'Valid GST Registration Certificate', is_mandatory: true, weight: 1, evidence_type: 'GST' },
      { id: 'req_2', tender_id: 'tnd_101', requirement_type: 'PAN', description: 'Permanent Account Number (PAN)', is_mandatory: true, weight: 1, evidence_type: 'PAN' },
      { id: 'req_3', tender_id: 'tnd_101', requirement_type: 'OEM_AUTHORIZATION', description: 'Original Equipment Manufacturer Authorization', is_mandatory: true, weight: 1, evidence_type: 'OEM_AUTHORIZATION' },
      { id: 'req_4', tender_id: 'tnd_101', requirement_type: 'LOCAL_CONTENT', description: 'Class-1 Local Content Declaration (Min 50%)', is_mandatory: true, weight: 1, evidence_type: 'LOCAL_CONTENT' },
      { id: 'req_5', tender_id: 'tnd_101', requirement_type: 'DEBARMENT', description: 'Non-debarment / Non-blacklisting Self Declaration', is_mandatory: true, weight: 1, evidence_type: 'DEBARMENT' },
    ],
  },
  {
    id: 'tnd_102',
    tender_number: 'CPCL/GEM/2026/208',
    gem_tender_id: 'GEM/2026/B/8902345',
    custom_tender_id: 'CPCL-MAINT-2026',
    title: 'Refinery Heat Exchanger Overhaul & Annual Maintenance',
    department: 'Chennai Petroleum Corporation Limited (CPCL)',
    organization: 'Ministry of Petroleum & Natural Gas',
    description: 'Turnkey overhaul, mechanical cleaning, retubing and hydrostatic testing of shell and tube heat exchangers.',
    estimated_value: 35000000,
    published_at: '2026-08-15T09:00:00Z',
    deadline: '2026-09-30T17:00:00Z',
    status: 'ACTIVE',
    tender_type: 'OPEN_TENDER',
    tender_category: 'SERVICES',
    tender_mode: 'ONLINE',
    bid_system: 'TWO_PACKET',
    location: 'Manali Refinery, Chennai',
    bid_validity_days: 120,
    is_flagged: true,
    flagged_reason: 'Suspicious pricing pattern flagged across 2 participating bidders during cross-check evaluation.',
    created_at: '2026-08-15T09:00:00Z',
    updated_at: '2026-09-12T14:30:00Z',
  },
  {
    id: 'tnd_103',
    tender_number: 'CPCL/GEM/2026/305',
    gem_tender_id: 'GEM/2026/B/9013456',
    custom_tender_id: 'CPCL-SAFETY-2026',
    title: 'Custom Automated Pipeline Safety Monitoring System',
    department: 'Chennai Petroleum Corporation Limited (CPCL)',
    organization: 'Ministry of Petroleum & Natural Gas',
    description: 'SCADA-integrated acoustic leak detection and pressure monitoring sensors for crude oil pipelines.',
    estimated_value: 18000000,
    published_at: '2026-09-05T11:00:00Z',
    deadline: '2026-10-10T17:00:00Z',
    status: 'ACTIVE',
    tender_type: 'LIMITED_TENDER',
    tender_category: 'WORKS',
    tender_mode: 'HYBRID',
    bid_system: 'TWO_PACKET',
    location: 'Nagapattinam Refinery Terminal',
    bid_validity_days: 90,
    is_flagged: false,
    created_at: '2026-09-05T11:00:00Z',
    updated_at: '2026-09-05T11:00:00Z',
  },
]

export const MOCK_BIDDERS: Bidder[] = [
  {
    id: 'bdr_001',
    company_name: 'Alpha Energy Solutions Ltd.',
    gst_number: '33AAACA1234A1Z5',
    pan_number: 'AAACA1234A',
    cin_number: 'U40100TN2018PLC123456',
    udyam_number: 'UDYAM-TN-02-0012345',
    legal_name: 'Alpha Energy Solutions Private Limited',
    registration_type: 'PRIVATE_LIMITED',
    registered_address: 'Plot 45, Guindy Industrial Estate, Chennai, Tamil Nadu 600032',
    state: 'Tamil Nadu',
    pincode: '600032',
    contact_person: 'Vikram Mehta',
    email: 'contact@alphaenergy.in',
    phone: '+91 98765 43210',
    msme_status: 'MEDIUM',
    startup_status: false,
    status: 'ACTIVE',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
  },
  {
    id: 'bdr_002',
    company_name: 'Beta Process Controls Pvt Ltd',
    gst_number: '27AABCB9876B1Z2',
    pan_number: 'AABCB9876B',
    cin_number: 'U29100MH2015PTC234567',
    udyam_number: 'UDYAM-MH-01-0098765',
    legal_name: 'Beta Process Controls Private Limited',
    registration_type: 'PRIVATE_LIMITED',
    registered_address: '102 Tech Park, MIDC Industrial Area, Thane, Maharashtra 400604',
    state: 'Maharashtra',
    pincode: '400604',
    contact_person: 'Ananya Deshmukh',
    email: 'info@betaprocess.com',
    phone: '+91 98200 11223',
    msme_status: 'SMALL',
    startup_status: true,
    status: 'ACTIVE',
    created_at: '2026-02-15T11:00:00Z',
    updated_at: '2026-09-02T14:00:00Z',
  },
  {
    id: 'bdr_003',
    company_name: 'Gamma Infra Engineering',
    gst_number: '29AACCG5432C1Z9',
    pan_number: 'AACCG5432C',
    legal_name: 'Gamma Infra Engineering LLP',
    registration_type: 'LLP',
    registered_address: '56 Electronic City, Hosur Road, Bengaluru, Karnataka 560100',
    state: 'Karnataka',
    pincode: '560100',
    contact_person: 'Suresh Gowda',
    email: 'bids@gammainfra.in',
    phone: '+91 99000 88776',
    msme_status: 'MICRO',
    startup_status: false,
    status: 'FLAGGED',
    flagged_reason: 'Shared IP address and director overlap identified in forensic audit',
    created_at: '2026-03-20T09:30:00Z',
    updated_at: '2026-09-08T16:00:00Z',
  },
]

export function getMockNetworkResponse(url: string, method: string = 'GET') {
  if (url.includes('/api/v1/auth/login')) {
    const isBidder = url.includes('bidder')
    const user = isBidder ? MOCK_USER_BIDDER : MOCK_USER_OFFICER
    return { access_token: 'mock_jwt_token_safe_scan', token_type: 'bearer', user }
  }

  if (url.includes('/api/v1/auth/me')) {
    const token = localStorage.getItem('gem_compliance_token') || ''
    if (token.includes('bidder')) return MOCK_USER_BIDDER
    if (token.includes('admin')) return MOCK_USER_ADMIN
    return MOCK_USER_OFFICER
  }

  if (url.includes('/api/v1/tenders') && method === 'GET') {
    if (url.match(/\/api\/v1\/tenders\/[^\/]+$/)) {
      return MOCK_TENDERS[0]
    }
    if (url.includes('/requirements')) {
      return MOCK_TENDERS[0].requirements || []
    }
    if (url.includes('/bidders')) {
      return MOCK_BIDDERS
    }
    return MOCK_TENDERS
  }

  if (url.includes('/api/v1/tenders') && method === 'POST') {
    return { ...MOCK_TENDERS[0], title: 'Newly Created Tender' }
  }

  if (url.includes('/api/v1/bidders')) {
    if (url.match(/\/api\/v1\/bidders\/[^\/]+$/)) {
      return MOCK_BIDDERS[0]
    }
    return MOCK_BIDDERS
  }

  if (url.includes('/api/v1/portal') || url.includes('/api/v1/bidder-portal')) {
    if (url.includes('/profile')) return MOCK_BIDDERS[0]
    if (url.includes('/dashboard')) {
      return {
        bidder_name: 'Alpha Energy Solutions Ltd.',
        compliance_score: 94,
        active_tenders_count: 3,
        documents_count: 5,
        pending_actions_count: 2,
        notifications_count: 3,
      }
    }
    if (url.includes('/tenders') || url.includes('/my-tenders')) return MOCK_TENDERS
    if (url.includes('/documents') || url.includes('/my-documents')) {
      return [
        { id: 'doc_1', category: 'GST', file_name: 'GST_Certificate_2026.pdf', verification_status: 'VERIFIED', uploaded_at: '2026-09-01T10:00:00Z', is_mandatory: true },
        { id: 'doc_2', category: 'PAN', file_name: 'PAN_Card_Alpha.pdf', verification_status: 'VERIFIED', uploaded_at: '2026-09-01T10:05:00Z', is_mandatory: true },
        { id: 'doc_3', category: 'UDYAM', file_name: 'Udyam_Registration.pdf', verification_status: 'VERIFIED', uploaded_at: '2026-09-02T11:00:00Z', is_mandatory: true },
        { id: 'doc_4', category: 'OEM_AUTHORIZATION', file_name: 'OEM_Auth_Letter.pdf', verification_status: 'VERIFIED', uploaded_at: '2026-09-03T14:20:00Z', is_mandatory: true },
        { id: 'doc_5', category: 'LOCAL_CONTENT', file_name: 'Local_Content_Declaration.pdf', verification_status: 'PENDING', uploaded_at: '2026-09-10T16:00:00Z', is_mandatory: true },
      ]
    }
    if (url.includes('/compliance')) {
      return {
        overall_score: 94,
        compliance_level: 'HIGH_COMPLIANCE',
        total_requirements: 5,
        verified_requirements: 5,
        flagged_issues_count: 0,
        bidmark_verdict: 'ELIGIBLE',
      }
    }
    if (url.includes('/action-required') || url.includes('/action-items')) {
      return [
        { id: 'act_1', title: 'Upload Updated ISO 9001:2025 Certificate', priority: 'ATTENTION', category: 'DOCUMENT_EXPIRING', deadline: '2026-09-20' },
        { id: 'act_2', title: 'Confirm Annual Turnover Declaration for FY 2025-26', priority: 'NORMAL', category: 'DECLARATION', deadline: '2026-09-24' },
      ]
    }
    if (url.includes('/submissions')) {
      return [
        { id: 'sub_1', tender_id: 'tnd_101', tender_title: 'Supply of High-Pressure Industrial Valve Actuators', quoted_price: 11800000, local_content_percent: 65, status: 'SUBMITTED', submitted_at: '2026-09-12T15:30:00Z' }
      ]
    }
    if (url.includes('/notifications')) {
      return [
        { id: 'notif_1', title: 'Tender CPCL/GEM/2026/104 Technical Evaluation Started', is_read: false, created_at: '2026-09-14T09:00:00Z' },
        { id: 'notif_2', title: 'OEM Authorization Document Successfully Verified', is_read: true, created_at: '2026-09-11T14:20:00Z' },
      ]
    }
    if (url.includes('/settings')) {
      return { email_notifications: true, sms_alerts: true, two_factor_auth: true, auto_document_sync: true }
    }
    return { message: 'Success' }
  }

  if (url.includes('/api/v1/bidmark')) {
    return {
      bidder_id: 'bdr_001',
      tender_id: 'tnd_101',
      overall_compliance_score: 94,
      overall_verdict: 'ELIGIBLE',
      compliance_status: 'PASSED',
      forensic_verdict: 'CLEAN',
      behavioral_verdict: 'LOW_RISK',
      explainable_flags: [
        { flag: 'Non-Critical Date Variance in MCA Certificate', severity: 'LOW', details: 'Incorporation date format uses DD/MM/YYYY instead of YYYY-MM-DD.' }
      ],
      ai_recommendation: 'QUALIFIED',
      decision_rationale: 'All 5 mandatory document checks passed government registry verification. OEM Authorization and Make in India local content ratio exceeds 50% threshold.',
    }
  }

  if (url.includes('/api/v1/dashboard/tender')) {
    return {
      tender: MOCK_TENDERS[0],
      bidders: [
        {
          bidder_id: 'bdr_001',
          company_name: 'Alpha Energy Solutions Ltd.',
          compliance_score: 94,
          risk_level: 'LOW',
          forensic_risk: 'LOW',
          behavior_risk: 'LOW',
          ai_recommendation: 'QUALIFIED',
          officer_decision: 'QUALIFIED',
        },
        {
          bidder_id: 'bdr_002',
          company_name: 'Beta Process Controls Pvt Ltd',
          compliance_score: 82,
          risk_level: 'MEDIUM',
          forensic_risk: 'LOW',
          behavior_risk: 'MEDIUM',
          ai_recommendation: 'PENDING_REVIEW',
          officer_decision: 'PENDING_REVIEW',
        },
      ]
    }
  }

  return { message: 'Mock response success', data: [] }
}
