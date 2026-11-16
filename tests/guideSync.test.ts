import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADMIN_TAB_REGISTRY,
  GUIDE_RELEASE_NOTES,
  INSTRUCTOR_FAQ_ITEMS,
  PRE_EXAM_CHECKLIST,
} from '../src/data/adminGuideRegistry.ts';

test('Mọi tab trong AdminDashboardPage.tsx đều có hướng dẫn tương ứng trong ADMIN_TAB_REGISTRY', () => {
  const adminSource = readFileSync('src/pages/AdminDashboardPage.tsx', 'utf8');
  const matches = Array.from(adminSource.matchAll(/activeTab === '([A-Z_]+)'/g)).map((m) => m[1]);
  const usedTabIds = Array.from(new Set(matches));
  assert.ok(usedTabIds.length >= 7, 'Phát hiện ít hơn 7 tab trong AdminDashboardPage.tsx');

  const registeredIds = new Set(ADMIN_TAB_REGISTRY.map((item) => item.id));
  for (const tabId of usedTabIds) {
    assert.ok(
      registeredIds.has(tabId as (typeof ADMIN_TAB_REGISTRY)[number]['id']),
      `Tab "${tabId}" có trong AdminDashboardPage.tsx nhưng chưa được khai báo hướng dẫn trong ADMIN_TAB_REGISTRY`,
    );
  }
});

test('Mỗi mục hướng dẫn trong ADMIN_TAB_REGISTRY đều đầy đủ thao tác và ví dụ minh họa', () => {
  const anchors = new Set<string>();
  ADMIN_TAB_REGISTRY.forEach((item, index) => {
    assert.equal(item.stepNumber, index + 1);
    assert.ok(!anchors.has(item.guideAnchor), `Trùng guideAnchor: ${item.guideAnchor}`);
    anchors.add(item.guideAnchor);
    assert.ok(item.summary.trim().length > 20, `${item.id} thiếu summary`);
    assert.ok(item.actions.length >= 2, `${item.id} cần ít nhất 2 bước thao tác`);
    assert.ok(item.exampleLines.length >= 1, `${item.id} cần ít nhất 1 dòng ví dụ minh họa`);
  });
});

test('Checklist, FAQ và Nhật ký cập nhật không bị rỗng', () => {
  assert.ok(PRE_EXAM_CHECKLIST.length >= 3);
  assert.ok(INSTRUCTOR_FAQ_ITEMS.length >= 4);
  assert.ok(GUIDE_RELEASE_NOTES.length >= 1);
});
