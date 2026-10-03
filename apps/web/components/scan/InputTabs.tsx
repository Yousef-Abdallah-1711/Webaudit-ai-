'use client';

/**
 * T179 — the three-tab input selector, extracted from `ScanForm` (T129) and
 * given the real backing the ported version could not have.
 *
 * T129's note said it plainly: "Only the URL tab is wired to a real
 * submission... Both tabs are disabled at the submit boundary rather than
 * silently pretending to work." Phase 6 built what they were waiting for —
 * `GET /repos` and `POST /scans/upload` — so this component replaces the
 * placeholder repository list and the decorative dropzone with the endpoints,
 * and hands its parent a resolved selection instead of a tab name.
 *
 * **The visual contract is unchanged.** Same markup, same tokens, same
 * `Screens.jsx` source. The new material is entirely state that the design has
 * no artboard for — loading, empty, revoked, uploading, staged — and each one
 * reuses an established pattern (`.dropzoneNote` for secondary text, the
 * existing error colour) rather than inventing a surface. No new screen, so
 * `design/screen-map.md` needs no new entry.
 *
 * **An archive is staged as soon as it is chosen, not at submit.** That is
 * deliberate and it is the interaction the guard makes possible: `POST
 * /scans/upload` validates and refuses without charging, so a hostile or
 * oversized archive is rejected while the user is still looking at the file
 * picker, rather than after they have chosen five areas and pressed a button
 * labelled "Accept and run". Refusing early is only safe because refusing is
 * free — FR-015's "before charging" is what buys this.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input } from '../ui';
import {
  API_BASE,
  ApiError,
  listRepositories,
  uploadArchive,
  type ConnectedRepository,
} from '../../lib/api';
const styles = {
  tabs: 'flex border-solid border-x-0 border-t-0 border-b-hairline border-b-border-default mb-5',
  tab: 'bg-transparent border-0 border-solid border-b-2 border-b-transparent mb-[-0.0625rem] px-4 py-[0.625rem] font-sans text-[0.875rem] font-normal text-text-secondary cursor-pointer',
  tabActive: '!border-b-accent !font-semibold !text-text-strong',
  repoList: 'flex flex-col gap-[0.625rem]',
  repoRow: 'flex items-center gap-[0.625rem] border border-solid border-hairline border-border-default rounded-control px-[0.875rem] py-3 cursor-pointer',
  repoName: 'font-mono text-[0.875rem]',
  repoTag: 'font-sans text-[0.875rem] leading-5 font-normal text-text-muted border border-solid border-hairline border-border-default rounded-control px-[0.375rem] py-0.5',
  repoBranch: 'ms-auto font-sans text-[0.875rem] leading-5 font-normal text-text-muted',
  note: 'm-0 font-sans text-[0.875rem] leading-5 font-normal text-text-secondary',
  noteStrong: 'm-0 font-sans text-[0.875rem] leading-5 font-normal text-text-primary text-pretty',
  unavailable: 'flex flex-col items-start gap-3 border border-solid border-hairline border-border-default rounded-card bg-surface-raised p-5',
  dropzone: 'border border-dashed border-hairline border-border-default rounded-card p-9 text-center bg-surface-raised',
  fileInput: 'hidden',
  dropzoneTitle: 'text-[0.9375rem] font-semibold',
  dropzoneNote: 'mt-1.5 font-sans text-[0.875rem] leading-5 font-normal text-text-secondary',
  refused: 'mt-3 mb-0 font-sans text-[0.875rem] leading-5 font-normal text-sev-critical text-pretty',
  browse: 'mt-[0.875rem] bg-transparent border-0 p-0 font-sans text-[0.875rem] text-accent underline cursor-pointer',
} as const;

export type InputTab = 'url' | 'repo' | 'archive';

/**
 * What the parent needs to create a target and a scan.
 *
 * A discriminated union rather than a tab name plus three optional fields:
 * "which tab is open" and "what has the user actually chosen" are different
 * questions, and a caller that conflated them would submit an empty URL
 * because the URL tab happened to be in front.
 */
export type InputSelection =
  | { readonly kind: 'url'; readonly value: string }
  | { readonly kind: 'repo'; readonly fullName: string }
  | { readonly kind: 'archive'; readonly targetId: string; readonly fileName: string };

export interface InputTabsProps {
  /** Null whenever the open tab has nothing usable in it yet. */
  readonly onChange: (selection: InputSelection | null) => void;
  /** Optional URL to seed the URL tab with, for a one-time public-hero handoff. */
  readonly initialUrl?: string;
}

/** Never fetched twice for the same mount, and never before the tab is opened. */
type RepoState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly repositories: readonly ConnectedRepository[] }
  | { readonly status: 'unavailable'; readonly code: string; readonly message: string };

type ArchiveState =
  | { readonly status: 'idle' }
  | { readonly status: 'uploading'; readonly fileName: string }
  | { readonly status: 'staged'; readonly fileName: string; readonly fileCount: number }
  | { readonly status: 'refused'; readonly message: string };

export function InputTabs({ onChange, initialUrl }: InputTabsProps): React.ReactElement {
  const t = useTranslations('scan');
  const [tab, setTab] = useState<InputTab>('url');
  const [url, setUrl] = useState(initialUrl ?? '');
  const [repos, setRepos] = useState<RepoState>({ status: 'idle' });
  const [chosenRepo, setChosenRepo] = useState<string | null>(null);
  const [archive, setArchive] = useState<ArchiveState>({ status: 'idle' });
  const [stagedTargetId, setStagedTargetId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // One effect, keyed on everything the selection is derived from, rather than
  // a call to `onChange` beside each setter. Four setters times three tabs is
  // twelve places to forget one, and the forgotten one is always the reset.
  useEffect(() => {
    if (tab === 'url') {
      onChange(url.trim() === '' ? null : { kind: 'url', value: url.trim() });
      return;
    }
    if (tab === 'repo') {
      onChange(chosenRepo === null ? null : { kind: 'repo', fullName: chosenRepo });
      return;
    }
    onChange(
      archive.status === 'staged' && stagedTargetId !== null
        ? { kind: 'archive', targetId: stagedTargetId, fileName: archive.fileName }
        : null,
    );
  }, [tab, url, chosenRepo, archive, stagedTargetId, onChange]);

  // Lazily, and once: a user who never opens the repository tab never causes a
  // GitHub request, which matters because the account may not be connected and
  // the answer to that is a 409 rather than an empty list.
  useEffect(() => {
    if (tab !== 'repo' || repos.status !== 'idle') return;
    setRepos({ status: 'loading' });
    void listRepositories()
      .then(({ repositories }) => {
        setRepos({ status: 'ready', repositories });
      })
      .catch((error: unknown) => {
        setRepos({
          status: 'unavailable',
          code: error instanceof ApiError ? error.code : 'UNKNOWN',
          message: error instanceof ApiError ? error.message : t('repo_connect'),
        });
      });
  }, [tab, repos.status, t]);

  const stage = useCallback(
    (file: File | undefined): void => {
      if (file === undefined) return;
      setArchive({ status: 'uploading', fileName: file.name });
      setStagedTargetId(null);
      void uploadArchive(file)
        .then(({ upload }) => {
          setStagedTargetId(upload.targetId);
          setArchive({ status: 'staged', fileName: file.name, fileCount: upload.fileCount });
        })
        .catch((error: unknown) => {
          // The API's message names the actual rule that refused — "the upload
          // is larger than the published archive size limit", "a symbolic link
          // is never extracted". Showing it verbatim is the whole point: a
          // generic "upload failed" would hide the one useful sentence.
          setArchive({
            status: 'refused',
            message: error instanceof ApiError ? error.message : t('drop_error_fallback'),
          });
        });
    },
    [t],
  );

  const tabs: readonly (readonly [InputTab, string])[] = [
    ['url', t('tab_url')],
    ['repo', t('tab_repo')],
    ['archive', t('tab_archive')],
  ];

  return (
    <div>
      <div className={styles.tabs} role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
            }}
            className={tab === key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'url' && (
        <Input
          prefix="https://"
          placeholder={t('url_ph')}
          value={url.replace(/^https?:\/\//, '')}
          onChange={(e) => {
            setUrl(e.target.value);
          }}
        />
      )}

      {tab === 'repo' && (
        <div className={styles.repoList}>
          {repos.status === 'loading' && <p className={styles.note}>{t('repo_loading')}</p>}

          {repos.status === 'unavailable' && (
            <div className={styles.unavailable}>
              <p className={styles.noteStrong}>{repos.message}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.href = `${API_BASE}/auth/oauth/github/start`;
                }}
              >
                {repos.code === 'REPO_CONNECTION_REVOKED'
                  ? t('repo_reconnect')
                  : t('repo_connect_cta')}
              </Button>
            </div>
          )}

          {repos.status === 'ready' && repos.repositories.length === 0 && (
            <p className={styles.note}>{t('repo_empty')}</p>
          )}

          {repos.status === 'ready' &&
            repos.repositories.map((repo) => (
              <label key={repo.fullName} className={styles.repoRow}>
                <input
                  type="radio"
                  name="repo"
                  checked={chosenRepo === repo.fullName}
                  onChange={() => {
                    setChosenRepo(repo.fullName);
                  }}
                />
                <span className={styles.repoName}>{repo.fullName}</span>
                {repo.isPrivate && <span className={styles.repoTag}>{t('repo_private')}</span>}
                <span className={styles.repoBranch}>{repo.defaultBranch}</span>
              </label>
            ))}
        </div>
      )}

      {tab === 'archive' && (
        <div
          className={styles.dropzone}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            stage(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className={styles.fileInput}
            onChange={(e) => {
              stage(e.target.files?.[0]);
            }}
          />

          {archive.status === 'uploading' ? (
            <div className={styles.dropzoneTitle}>{t('drop_uploading')}</div>
          ) : archive.status === 'staged' ? (
            <>
              <div className={styles.dropzoneTitle}>{t('drop_staged')}</div>
              <div className={styles.dropzoneNote}>
                {archive.fileName} · {archive.fileCount} {t('drop_files')}
              </div>
            </>
          ) : (
            <>
              <div className={styles.dropzoneTitle}>{t('drop_archive')}</div>
              <div className={styles.dropzoneNote}>{t('drop_note')}</div>
            </>
          )}

          {archive.status === 'refused' && (
            <p className={styles.refused} role="alert">
              {archive.message}
            </p>
          )}

          <button
            type="button"
            className={styles.browse}
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            {archive.status === 'staged' ? t('drop_replace') : t('drop_browse')}
          </button>
        </div>
      )}
    </div>
  );
}
