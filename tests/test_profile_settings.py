import copy
import fcntl
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('profile_settings', Path(__file__).parents[1] / 'scripts/profile_settings.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / 'profiles' / 'alpha'
        self.home.mkdir(parents=True)
        self.workspace = self.root / 'workspace'
        self.workspace.mkdir()
        self.config = {'model': {'default': 'glm-5.3-flash'}, 'terminal': {'cwd': str(self.workspace)},
                       'platform_toolsets': {'cli': ['clarify']}, 'approvals': {'mode': 'manual'},
                       'future': {'unknown': {'preserve': 7}}, 'provider_secret': 'PRIVATE_CANARY'}
        (self.home / 'config.yaml').write_text(json.dumps(self.config))
        (self.home / 'SOUL.md').write_text('Original persona')
        (self.home / '.blueoffice-agent.json').write_text(json.dumps({'agentId': 'alpha-owner'}))
        self.values = {'model': 'muse-spark-1.3-contributor', 'workspace': str(self.workspace),
                       'soul': 'A precise assistant', 'toolsets': ['file', 'clarify'], 'approvalMode': 'manual'}
        self.routing = {'model': {'default': self.values['model'], 'provider': 'custom:blueoffice-muse',
                                 'base_url': 'http://127.0.0.1:8317/v1', 'api_mode': 'codex_responses'},
                        'providers': {'blueoffice-muse': {'transport': 'codex_responses', 'key_env': 'BLUEOFFICE_PROXY_KEY'}},
                        'auxiliary': {'compression': {'provider': 'custom:blueoffice-muse', 'model': self.values['model']}},
                        'delegation': {'provider': 'custom:blueoffice-muse', 'model': self.values['model'], 'fallback_providers': []}}

    def run_operation(self, action='read', **fields):
        return module.run({'action': action, 'profileHome': str(self.home), **fields}, 'fixture', self.root)

    def request(self):
        return {'action': 'save', 'profileHome': str(self.home), 'agentId': 'alpha-owner',
                'expectedRevision': module.revision(self.home), 'values': copy.deepcopy(self.values), 'routing': self.routing}

    def test_unknown_keys_readback_revision_and_no_credentials(self):
        before = self.run_operation()
        self.assertNotIn('PRIVATE_CANARY', json.dumps(before))
        result = module.run(self.request(), 'fixture', self.root)
        self.assertTrue(result['ok'])
        self.assertNotEqual(before['revision'], result['snapshot']['revision'])
        self.assertEqual(result['snapshot']['values'], self.values)
        self.assertEqual(json.loads((self.home / 'config.yaml').read_text())['future'], self.config['future'])
        self.assertEqual(result['snapshot']['scope'], 'profile')
        self.assertEqual(result['snapshot']['effect'], 'next-start')

    def test_stale_revision_external_edit_is_never_overwritten(self):
        request = self.request()
        self.config['future']['external'] = True
        (self.home / 'config.yaml').write_text(json.dumps(self.config))
        with self.assertRaisesRegex(module.ProfileError, 'outside this editor'):
            module.run(request, 'fixture', self.root)
        self.assertEqual(json.loads((self.home / 'config.yaml').read_text()), self.config)
        self.assertEqual((self.home / 'SOUL.md').read_text(), 'Original persona')

    def test_partial_persona_failure_reports_configuration_success(self):
        write = module.atomic_write
        def refuse_persona(path, data):
            if path.name == 'SOUL.md':
                raise PermissionError()
            write(path, data)
        with patch.object(module, 'atomic_write', side_effect=refuse_persona):
            result = module.run(self.request(), 'fixture', self.root)
        self.assertFalse(result['ok'])
        self.assertTrue(result['sections']['model']['applied'])
        self.assertFalse(result['sections']['soul']['applied'])
        self.assertEqual(result['snapshot']['values']['soul'], 'Original persona')
        self.assertEqual(result['snapshot']['values']['model'], self.values['model'])

    def test_external_persona_change_between_section_writes_survives(self):
        save_config = module.Settings.save_config
        def external_edit(settings, config):
            save_config(settings, config)
            (settings.home / 'SOUL.md').write_text('External concurrent persona')
        with patch.object(module.Settings, 'save_config', external_edit):
            result = module.run(self.request(), 'fixture', self.root)
        self.assertFalse(result['ok'])
        self.assertTrue(result['sections']['model']['applied'])
        self.assertFalse(result['sections']['soul']['applied'])
        self.assertIn('changed during', result['sections']['soul']['message'])
        self.assertEqual(result['snapshot']['values']['soul'], 'External concurrent persona')

    def test_kernel_owner_blocks_save_and_adoption(self):
        with open(self.home / '.blueoffice-lease', 'w') as lease:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertTrue(self.run_operation()['liveOwner'])
            with self.assertRaisesRegex(module.ProfileError, 'live owner'):
                module.run(self.request(), 'fixture', self.root)

    def test_adoption_requires_acknowledgement_and_one_persistent_owner(self):
        (self.home / '.blueoffice-agent.json').unlink()
        request = self.request()
        request.update(action='adopt', agentId='new-owner')
        with self.assertRaisesRegex(module.ProfileError, 'single-writer'):
            module.run(request, 'fixture', self.root)
        request['acknowledgeOwnership'] = True
        result = module.run(request, 'fixture', self.root)
        self.assertTrue(result['ok'])
        self.assertEqual(result['snapshot']['ownerId'], 'new-owner')
        request['agentId'] = 'other-owner'
        with self.assertRaisesRegex(module.ProfileError, 'already assigned'):
            module.run(request, 'fixture', self.root)

    def test_wrong_owner_foreign_path_and_linked_files_rejected(self):
        request = self.request()
        request['agentId'] = 'other-owner'
        with self.assertRaisesRegex(module.ProfileError, 'not owned'):
            module.run(request, 'fixture', self.root)
        request['profileHome'] = str(self.workspace)
        with self.assertRaisesRegex(module.ProfileError, 'named profiles'):
            module.run(request, 'fixture', self.root)
        (self.home / 'SOUL.md').unlink()
        external = self.root / 'external'
        external.write_text('Do not change')
        (self.home / 'SOUL.md').symlink_to(external)
        with self.assertRaisesRegex(module.ProfileError, 'symbolic links'):
            self.run_operation()
        self.assertEqual(external.read_text(), 'Do not change')

    def test_two_profiles_and_canonical_alias_cannot_cross_ownership(self):
        other = self.root / 'profiles' / 'beta'
        other.mkdir()
        (other / 'config.yaml').write_text(json.dumps(self.config))
        (other / '.blueoffice-agent.json').write_text(json.dumps({'agentId': 'beta-owner'}))
        request = self.request()
        request['profileHome'] = str(other)
        request['expectedRevision'] = module.revision(other)
        with self.assertRaisesRegex(module.ProfileError, 'not owned'):
            module.run(request, 'fixture', self.root)
        alias = self.root / 'profiles' / 'alias'
        alias.symlink_to(self.home, target_is_directory=True)
        self.assertEqual(self.run_operation(profileHome=str(alias))['ownerId'], 'alpha-owner')


if __name__ == '__main__':
    unittest.main()
