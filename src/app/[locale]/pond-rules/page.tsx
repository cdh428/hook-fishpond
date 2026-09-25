'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

type Tab = 'leisure' | 'competition' | 'rewards';

const TABS: Tab[] = ['leisure', 'competition', 'rewards'];

const TAKE_HOME_SPECIES = [
  'tilapia',
  'snakehead',
  'climbingPerch',
  'silverBarb',
  'marbledGoby',
  'walkingCatfish',
  'stripedCatfish',
] as const;

const REWARDS = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;
const REWARDS_HIGHLIGHT = new Set<string>(['m1', 'm3']);

/** 一条规则 */
function Item({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'warn';
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
          tone === 'warn' ? 'bg-error-500' : 'bg-primary-400'
        }`}
      />
      <span className="text-sm leading-relaxed text-neutral-700">{children}</span>
    </li>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-md">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg leading-none">{icon}</span>
        <h2 className="text-base font-bold text-neutral-900">{title}</h2>
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

/**
 * 三个页签的内容全部渲染进 DOM，非激活的用 `hidden` 收起。
 * 这样做的原因：三语核验脚本（scripts/check-i18n.mjs 第 3 层）扫描的是渲染
 * 出来的正文，只渲染当前页签会让另外两个页签的文案逃过检查。
 */
export default function PondRulesPage() {
  const t = useTranslations('pondRules');
  const tc = useTranslations('common');
  const [tab, setTab] = useState<Tab>('leisure');

  const panel = (id: Tab) => `space-y-4 px-4 py-5 ${tab === id ? '' : 'hidden'}`;

  return (
    <div className="mx-auto max-w-lg">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 px-6 pb-12 pt-8 text-white">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary-600/30" />
        <div className="absolute -left-12 top-20 h-24 w-24 rounded-full bg-primary-500/20" />
        <div className="absolute right-1/4 top-24 h-16 w-16 rounded-full bg-accent-500/15" />

        <div className="relative z-10">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            {t('meta.title')}
          </h1>
          <p className="mt-1.5 text-sm text-primary-100">{t('meta.subtitle')}</p>
          <p className="mt-3 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] text-primary-100">
            {t('meta.updated')}
          </p>
        </div>

        <svg
          className="absolute bottom-0 left-0 right-0 text-bg-page"
          viewBox="0 0 1440 60"
          fill="currentColor"
        >
          <path d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,40 1440,35 L1440,60 L0,60 Z" />
        </svg>
      </section>

      {/* Tabs */}
      <div className="-mt-5 px-4">
        <div className="flex gap-1 rounded-2xl bg-white p-1 shadow-md">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${
                tab === id
                  ? 'bg-primary-700 text-white shadow-brand'
                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700'
              }`}
            >
              {t(`tab.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ 休闲塘 */}
      <div className={panel('leisure')}>
        <Card icon="💰" title={t('fee.title')}>
          <li className="list-none">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
                <div className="text-xs font-medium text-primary-700">{t('fee.ownRod')}</div>
                <div className="mt-1 text-lg font-bold text-primary-900">
                  {t('fee.ownRodPrice')}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-primary-600">
                  {t('fee.ownRodNote')}
                </div>
              </div>
              <div className="rounded-xl border border-accent-200 bg-accent-50 p-3">
                <div className="text-xs font-medium text-accent-700">{t('fee.rentRod')}</div>
                <div className="mt-1 text-lg font-bold text-accent-900">
                  {t('fee.rentRodPrice')}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-accent-700">
                  {t('fee.rentRodNote')}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700">
              <span className="text-success-600">✓</span>
              {t('fee.either')}
            </div>
          </li>
          <Item>{t('fee.allDay')}</Item>
          <Item>{t('fee.hours')}</Item>
          <Item>{t('fee.monday')}</Item>
        </Card>

        {/* 渔获 —— 全页最该被看见的一段 */}
        <section className="overflow-hidden rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 to-accent-100 p-5 shadow-md">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg leading-none">🐟</span>
            <h2 className="text-base font-bold text-neutral-900">{t('catch.title')}</h2>
          </div>

          <div className="mt-3 rounded-xl bg-white/75 px-4 py-3">
            <div className="text-xl font-bold text-neutral-900">{t('catch.first1kg')}</div>
            <div className="mt-0.5 text-sm font-semibold text-accent-700">
              {t('catch.overPrice')}
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            <Item>{t('catch.allTakeHome')}</Item>
            <Item>{t('catch.weigh')}</Item>
          </ul>

          <div className="mt-4">
            <div className="text-xs font-semibold text-neutral-600">
              {t('catch.speciesTitle')}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TAKE_HOME_SPECIES.map((id) => (
                <span
                  key={id}
                  className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-xs font-medium text-primary-800"
                >
                  {t(`fish.${id}`)}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-error-100 bg-error-50 px-2.5 py-1 text-xs font-semibold text-error-700">
                {t('fish.mekongCatfish')} · {t('catch.noTake')}
              </span>
            </div>
          </div>
        </section>

        <Card icon="🎣" title={t('bait.title')}>
          <Item tone="warn">{t('bait.noOwnBait')}</Item>
        </Card>

        <Card icon="🍽️" title={t('dining.title')}>
          <Item>{t('dining.noOutside')}</Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('dining.exceptionsLabel')}</span>
            <br />
            {t('dining.exceptions')}
          </Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('dining.processing')}</span>
            <br />
            {t('dining.processingNote')}
            <br />
            <span className="text-xs text-neutral-500">{t('dining.processingExample')}</span>
          </Item>
        </Card>

        <Card icon="🔧" title={t('gear.title')}>
          <Item>
            <span className="font-semibold text-neutral-900">{t('gear.noDeposit')}</span>
          </Item>
          <Item tone="warn">{t('gear.compensation')}</Item>
          <Item>{t('gear.collectRod')}</Item>
        </Card>

        <Card icon="⚠️" title={t('safety.title')}>
          <Item>{t('safety.child')}</Item>
          <Item>{t('safety.noRunning')}</Item>
          <Item tone="warn">
            {t('safety.noSwim')}
            <br />
            <span className="text-xs text-neutral-500">{t('safety.noSwimNote')}</span>
          </Item>
          <Item>{t('safety.keepClean')}</Item>
          <Item>{t('safety.noNoise')}</Item>
        </Card>
      </div>

      {/* ------------------------------------------------------------ 竞赛塘 */}
      <div className={panel('competition')}>
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-700 to-accent-900 px-5 py-4 text-white shadow-md">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative z-10">
            <div className="text-xs font-semibold text-accent-100">{t('tab.competition')}</div>
            <div className="mt-1 text-3xl font-bold tracking-tight">{t('comp.price')}</div>
            <div className="mt-1.5 text-xs leading-relaxed text-accent-100">
              {t('comp.priceNote')}
            </div>
          </div>
        </section>

        <Card icon="🏆" title={t('comp.title')}>
          <Item>{t('comp.time')}</Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('comp.booking')}</span>
            <br />
            <span className="text-xs text-neutral-500">{t('comp.bookingNote')}</span>
          </Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('comp.catch')}</span>
            <br />
            <span className="text-xs text-neutral-500">{t('comp.catchNote')}</span>
          </Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('comp.ranking')}</span>
            <br />
            <span className="text-xs text-neutral-500">{t('comp.rankingNote')}</span>
          </Item>
          <Item tone="warn">{t('comp.noSwim')}</Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('comp.absent')}</span>
            <br />
            <span className="text-xs text-neutral-500">{t('comp.absentNote')}</span>
          </Item>
          <Item>{t('comp.gear')}</Item>
          <Item>{t('comp.judging')}</Item>
          <Item>
            <span className="font-semibold text-neutral-900">{t('comp.prize')}</span>
          </Item>
        </Card>
      </div>

      {/* ------------------------------------------------------------ 奖励 */}
      <div className={panel('rewards')}>
        <section className="rounded-2xl bg-white p-5 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">🎁</span>
            <h2 className="text-base font-bold text-neutral-900">{t('rewards.title')}</h2>
          </div>
          <p className="mt-1.5 text-sm text-neutral-500">{t('rewards.subtitle')}</p>
        </section>

        {REWARDS.map((id, i) => {
          const highlight = REWARDS_HIGHLIGHT.has(id);
          return (
            <article
              key={id}
              className={`rounded-2xl border bg-white p-5 shadow-md ${
                highlight ? 'border-accent-200 ring-1 ring-accent-100' : 'border-neutral-100'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    highlight ? 'bg-accent-100 text-accent-800' : 'bg-primary-50 text-primary-700'
                  }`}
                >
                  M{i + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-400">
                    {t(`rewards.${id}Name`)}
                  </div>
                  <h3 className="mt-0.5 text-sm font-bold leading-snug text-neutral-900">
                    {t(`rewards.${id}Title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                    {t(`rewards.${id}Desc`)}
                  </p>
                </div>
              </div>
            </article>
          );
        })}

        <p className="px-1 text-xs leading-relaxed text-neutral-400">{t('rewards.note')}</p>
      </div>

      {/* CTA */}
      <section className="px-4 pb-8 pt-1">
        <div className="flex gap-3">
          <Link
            href="/booking"
            className="flex-1 rounded-xl bg-primary-700 py-3 text-center text-sm font-semibold text-white shadow-brand transition hover:bg-primary-800"
          >
            {tc('booking')}
          </Link>
          <Link
            href="/menu"
            className="flex-1 rounded-xl border border-primary-200 bg-white py-3 text-center text-sm font-semibold text-primary-700 shadow-md transition hover:bg-primary-50"
          >
            {tc('menu')}
          </Link>
        </div>
      </section>
    </div>
  );
}
