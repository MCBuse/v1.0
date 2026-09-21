import json
import os
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from scoring.app import app
from scoring.engine import evaluate, MODEL
ROOT=Path(__file__).resolve().parent
CASES=json.loads((ROOT/'parity-inputs.json').read_text())
EXPECTED=json.loads((ROOT/'html-expected.json').read_text())
class ScoringTests(unittest.TestCase):
 def test_html_parity(self):
  for case, expected in zip(CASES,EXPECTED):
   with self.subTest(case=case):
    actual=evaluate(case['values'],case['asOfDate'],True)
    self.assertAlmostEqual(actual['financialProfile']['score'],expected['financial'],places=9)
    self.assertAlmostEqual(actual['profileConfidence']['confidenceScore'],expected['confidence']['confidenceScore'],places=9)
    self.assertAlmostEqual(actual['experimentalCredit']['probabilityOfDefault'],expected['risk']['pDefault'],places=10)
    self.assertAlmostEqual(actual['experimentalCredit']['policyOverlayPoints'],expected['risk']['overlayPoints'],places=9)
    self.assertEqual(actual['experimentalCredit']['creditScore'],int(expected['risk']['score']+0.5))
    self.assertEqual(actual['experimentalCredit']['creditGrade'],expected['grade'])
 def test_missing_required_preserves_confidence(self):
  raw={**CASES[0]['values'],'estimated_margin_pct':None}
  r=evaluate(raw,'2026-09-20',True)
  self.assertIsNone(r['financialProfile']);self.assertIsNone(r['experimentalCredit']);self.assertIsNotNone(r['profileConfidence'])
  self.assertIn('estimated_margin_pct',r['unavailableFields'])
 def test_public_result_has_no_risk(self):
  self.assertNotIn('experimentalCredit',evaluate(CASES[0]['values'],'2026-09-20'))
 def test_minor_amount_and_date_boundaries(self):
  raw={**CASES[0]['values'],'avg_txn_value_eur':0.10,'commencement_date':'2026-08-21'}
  self.assertEqual(evaluate(raw,'2026-09-20')['businessAgeMonths'],0)
  self.assertEqual(evaluate(raw,'2026-09-21')['businessAgeMonths'],1)
 def test_invalid_input(self):
  for patch in [{'capture_quality':101},{'loan_amount_eur':-1},{'cv_txn_value':float('nan')},{'finalized_payments':True},{'commencement_date':'2027-01-01'},{'unknown':1}]:
   with self.subTest(patch=patch), self.assertRaises(ValueError):evaluate({**CASES[0]['values'],**patch},'2026-09-20')
 def test_private_api_and_version(self):
  os.environ['CREDIT_SCORING_TOKEN']='test-token-that-has-at-least-32-characters'
  with TestClient(app) as client:
   body={**CASES[0],'experimental':True,'modelVersion':MODEL['modelVersion']}
   self.assertEqual(client.post('/v1/evaluate',json=body).status_code,401)
   headers={'Authorization':'Bearer '+os.environ['CREDIT_SCORING_TOKEN']}
   self.assertEqual(client.post('/v1/evaluate',json=body,headers=headers).status_code,200)
   self.assertEqual(client.post('/v1/evaluate',json={**body,'modelVersion':'unknown'},headers=headers).status_code,409)
   self.assertEqual(client.post('/v1/evaluate',json={**body,'values':{'merchant_type':'other'}},headers=headers).status_code,422)
   self.assertEqual(client.get('/v1/model/metadata').status_code,401)
if __name__=='__main__':unittest.main()
