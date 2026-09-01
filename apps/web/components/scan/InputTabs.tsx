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
import { Button, Input } from '../ui';
import { useT } from '../../app/theme';
import { ApiError, listRepositories, uploadArchive, type ConnectedRepository } from '../../lib/api';
import styles from './InputTabs.module.css';

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

export function InputTabs({ onChange }: InputTabsProps): React.ReactElement {
  const [t] = useT();
  const [tab, setTab] = useState<InputTab>('url');
  const [url, setUrl] = useState('');
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

  const stage = useCallback((file: File | undefined): void => {
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
          message: error instanceof ApiError ? error.message : 'The archive could not be accepted.',
        });
      });
  }, []);

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
                  window.location.href = '/auth/github/connect';
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
