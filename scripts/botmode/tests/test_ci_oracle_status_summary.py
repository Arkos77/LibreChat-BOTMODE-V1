import runpy,unittest,json
from pathlib import Path
MODULE=Path(__file__).resolve().parents[1] / 'ci-oracle-status-summary.py'
class SummaryTests(unittest.TestCase):
 def summary(self, candidate, status='REJECTED', reason='INVALID_CANDIDATE'):
  f=runpy.run_path(str(MODULE))['summarize']
  plan={'tasks':[{'key':'worker','taskId':'secret-task-id'},{'key':'specialist_1','taskId':'secret-other-id'}]}
  state={'results':{'secret-task-id':{'verdicts':[{'status':status,'input':{'candidate':candidate},'reasons':[{'code':reason}]}]}}}
  return f(plan,state)
 def test_rejected_worker_is_distinguished_from_missing_specialist(self):
  s=self.summary('```json\n{"ok":true}\n```')
  self.assertEqual(s['stages'][0]['verdicts'][0]['status'],'REJECTED')
  self.assertEqual(s['stages'][0]['verdicts'][0]['candidate']['kind'],'INVALID_JSON')
  self.assertTrue(s['stages'][0]['verdicts'][0]['candidate']['markdownFence'])
  self.assertEqual(s['stages'][1]['verdictCount'],0)
 def test_valid_boolean_conformance(self):
  c=self.summary('{"ok":true}',status='VERIFIED',reason='CRITERION_MET')['stages'][0]['verdicts'][0]['candidate']
  self.assertEqual(c['kind'],'JSON_OBJECT');self.assertTrue(c['okExactlyTrue'])
 def test_string_true_is_not_boolean_true(self):
  self.assertFalse(self.summary('{"ok":"true"}')['stages'][0]['verdicts'][0]['candidate']['okExactlyTrue'])
 def test_model_text_ids_and_unknown_codes_are_not_exposed(self):
  out=json.dumps(self.summary('DO_NOT_PRINT_SECRET',status='PRIVATE_STATUS',reason='PRIVATE_REASON'))
  for value in ['DO_NOT_PRINT_SECRET','PRIVATE_STATUS','PRIVATE_REASON','secret-task-id','secret-other-id']:self.assertNotIn(value,out)
 def test_untrusted_fields_are_not_exposed(self):
  out=json.dumps(self.summary('{"ok":false,"PRIVATE_FIELD":"PRIVATE_VALUE"}'))
  self.assertNotIn('PRIVATE_FIELD',out);self.assertNotIn('PRIVATE_VALUE',out)
 def test_missing_candidate_is_explicit(self):
  self.assertEqual(self.summary(None)['stages'][0]['verdicts'][0]['candidate']['kind'],'MISSING')
if __name__=='__main__':unittest.main()
