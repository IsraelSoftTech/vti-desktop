const { pool } = require('./db');
const { formatHHMM12 } = require('./cameroonClock');
const { listLinkedStudents } = require('./parentStudents');
const { notifyParentOfAdminChat } = require('./parentNotify');
const { storeChatFile, readChatFile } = require('./chatMedia');

const PAGE = 40;
const DELETED_TEXT = 'This message was deleted';

function previewOf(row) {
  if (row.deleted_for_everyone) return DELETED_TEXT;
  const kind = row.attachment_kind;
  if (kind === 'image') return row.body ? String(row.body).slice(0, 80) : 'Photo';
  if (kind === 'audio') return 'Voice message';
  if (kind === 'document') return row.attachment_name || 'Document';
  return String(row.body || '').slice(0, 120);
}

function mapMessage(row) {
  const deleted = Boolean(row.deleted_for_everyone);
  return {
    id: Number(row.id),
    threadId: Number(row.thread_id),
    senderRole: row.sender_role,
    senderUserId: row.sender_user_id ? Number(row.sender_user_id) : null,
    body: deleted ? DELETED_TEXT : row.body || '',
    attachmentKind: deleted ? null : row.attachment_kind || null,
    attachmentName: deleted ? null : row.attachment_name || null,
    attachmentMime: deleted ? null : row.attachment_mime || null,
    attachmentSize: deleted || !row.attachment_size ? null : Number(row.attachment_size),
    createdAt: row.created_at,
    timeLabel: formatHHMM12(row.created_at),
    readAt: row.read_at || null,
    read: Boolean(row.read_at),
    deletedForEveryone: deleted,
  };
}

function hiddenColumn(viewerRole) {
  return viewerRole === 'admin' ? 'hidden_for_admin' : 'hidden_for_parent';
}

async function refreshThreadPreview(threadId) {
  const { rows } = await pool.query(
    `SELECT * FROM attendance_parent_messages
     WHERE thread_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [threadId]
  );
  const row = rows[0];
  if (!row) {
    await pool.query(
      `UPDATE attendance_parent_threads
       SET last_message_at = NULL, last_message_preview = NULL, last_sender_role = NULL
       WHERE id = $1`,
      [threadId]
    );
    return;
  }
  await pool.query(
    `UPDATE attendance_parent_threads
     SET last_message_at = $2,
         last_message_preview = $3,
         last_sender_role = $4
     WHERE id = $1`,
    [threadId, row.created_at, previewOf(row), row.sender_role]
  );
}

async function getOrCreateThread(parentUserId) {
  const existing = await pool.query(
    `SELECT * FROM attendance_parent_threads WHERE parent_user_id = $1`,
    [parentUserId]
  );
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await pool.query(
    `INSERT INTO attendance_parent_threads (parent_user_id)
     VALUES ($1)
     ON CONFLICT (parent_user_id) DO UPDATE SET parent_user_id = EXCLUDED.parent_user_id
     RETURNING *`,
    [parentUserId]
  );
  return inserted.rows[0];
}

async function getThreadForParent(parentUserId) {
  return getOrCreateThread(parentUserId);
}

async function getThreadById(threadId) {
  const { rows } = await pool.query(
    `SELECT t.*, u.full_name AS parent_name, u.username AS parent_phone
     FROM attendance_parent_threads t
     JOIN attendance_users u ON u.id = t.parent_user_id
     WHERE t.id = $1`,
    [threadId]
  );
  return rows[0] || null;
}

async function listMessages(threadId, { beforeId, limit, viewerRole } = {}) {
  const size = Math.min(80, Math.max(1, Number(limit) || PAGE));
  const params = [threadId];
  const hidden = hiddenColumn(viewerRole === 'admin' ? 'admin' : 'parent');
  let sql = `
    SELECT * FROM attendance_parent_messages
    WHERE thread_id = $1
      AND COALESCE(${hidden}, FALSE) = FALSE
  `;
  if (beforeId && Number(beforeId) > 0) {
    params.push(Number(beforeId));
    sql += ` AND id < $2`;
  }
  sql += ` ORDER BY id DESC LIMIT ${size}`;
  const { rows } = await pool.query(sql, params);
  return rows.reverse().map(mapMessage);
}

async function unreadFromRole(threadId, senderRole) {
  const hidden = senderRole === 'admin' ? 'hidden_for_parent' : 'hidden_for_admin';
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM attendance_parent_messages
     WHERE thread_id = $1 AND sender_role = $2 AND read_at IS NULL
       AND COALESCE(deleted_for_everyone, FALSE) = FALSE
       AND COALESCE(${hidden}, FALSE) = FALSE`,
    [threadId, senderRole]
  );
  return rows[0]?.n || 0;
}

async function parentChatUnread(parentUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM attendance_parent_messages m
     JOIN attendance_parent_threads t ON t.id = m.thread_id
     WHERE t.parent_user_id = $1
       AND m.sender_role = 'admin'
       AND m.read_at IS NULL
       AND COALESCE(m.deleted_for_everyone, FALSE) = FALSE
       AND COALESCE(m.hidden_for_parent, FALSE) = FALSE`,
    [parentUserId]
  );
  return rows[0]?.n || 0;
}

async function markRead(threadId, readerRole) {
  const other = readerRole === 'parent' ? 'admin' : 'parent';
  const { rowCount } = await pool.query(
    `UPDATE attendance_parent_messages
     SET read_at = NOW()
     WHERE thread_id = $1
       AND sender_role = $2
       AND read_at IS NULL`,
    [threadId, other]
  );
  return { updated: rowCount || 0 };
}

async function sendMessage({
  threadId,
  senderRole,
  senderUserId,
  body,
  file,
}) {
  const text = String(body || '').trim().slice(0, 4000);
  if (senderRole !== 'parent' && senderRole !== 'admin') {
    const err = new Error('Invalid sender.');
    err.status = 400;
    throw err;
  }
  let attachment = null;
  if (file?.buffer?.length) {
    attachment = await storeChatFile({
      buffer: file.buffer,
      mime: file.mimetype,
      originalName: file.originalname,
      threadId,
    });
  }
  if (!text && !attachment) {
    const err = new Error('Type a message or attach a file.');
    err.status = 400;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO attendance_parent_messages (
       thread_id, sender_role, sender_user_id, body,
       attachment_kind, attachment_url, attachment_name, attachment_mime, attachment_size
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      threadId,
      senderRole,
      senderUserId,
      text,
      attachment?.kind || null,
      attachment?.url || null,
      attachment?.name || null,
      attachment?.mime || null,
      attachment?.size || null,
    ]
  );
  const row = rows[0];
  const preview = previewOf(row);
  await pool.query(
    `UPDATE attendance_parent_threads
     SET last_message_at = $2,
         last_message_preview = $3,
         last_sender_role = $4
     WHERE id = $1`,
    [threadId, row.created_at, preview, senderRole]
  );

  if (senderRole === 'admin') {
    const thread = await getThreadById(threadId);
    if (thread) {
      const pushBody =
        text ||
        (attachment?.kind === 'image'
          ? 'Photo from the school'
          : attachment?.kind === 'audio'
            ? 'Voice message from the school'
            : 'New file from the school');
      await notifyParentOfAdminChat({
        parentUserId: thread.parent_user_id,
        body: pushBody,
        threadId,
        messageId: row.id,
      }).catch((err) => console.warn('[chat] parent push', err?.message || err));
    }
  }

  return mapMessage(row);
}

async function getParentChat(parentUserId) {
  const thread = await getOrCreateThread(parentUserId);
  const [messages, students, unread] = await Promise.all([
    listMessages(thread.id, { limit: PAGE, viewerRole: 'parent' }),
    listLinkedStudents(parentUserId),
    unreadFromRole(thread.id, 'admin'),
  ]);
  return {
    thread: {
      id: Number(thread.id),
      parentUserId: Number(thread.parent_user_id),
    },
    messages,
    students: students.map((s) => ({ id: s.id, fullName: s.fullName })),
    unreadCount: unread,
  };
}

async function sendParentMessage(parentUserId, { body, file }) {
  const thread = await getOrCreateThread(parentUserId);
  return sendMessage({
    threadId: thread.id,
    senderRole: 'parent',
    senderUserId: parentUserId,
    body,
    file,
  });
}

async function markParentRead(parentUserId) {
  const thread = await getOrCreateThread(parentUserId);
  const result = await markRead(thread.id, 'parent');
  try {
    const { markChatInboxRead } = require('./parentNotify');
    await markChatInboxRead(parentUserId);
  } catch {
    /* inbox table may be empty */
  }
  return result;
}

async function listAdminThreads({ q, page, pageSize } = {}) {
  const size = Math.min(50, Math.max(1, Number(pageSize) || 30));
  const p = Math.max(1, Number(page) || 1);
  const offset = (p - 1) * size;
  const search = String(q || '').trim();
  const params = [];
  let where = `WHERE t.last_message_at IS NOT NULL`;
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.full_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
  }
  const countSql = `
    SELECT COUNT(*)::int AS n
    FROM attendance_parent_threads t
    JOIN attendance_users u ON u.id = t.parent_user_id
    ${where}
  `;
  const { rows: countRows } = await pool.query(countSql, params);
  params.push(size, offset);
  const { rows } = await pool.query(
    `SELECT t.*, u.full_name AS parent_name, u.username AS parent_phone,
            (SELECT COUNT(*)::int
             FROM attendance_parent_messages m
             WHERE m.thread_id = t.id
               AND m.sender_role = 'parent'
               AND m.read_at IS NULL
               AND COALESCE(m.deleted_for_everyone, FALSE) = FALSE
               AND COALESCE(m.hidden_for_admin, FALSE) = FALSE
            ) AS unread_count,
            (SELECT CASE
                      WHEN lastm.deleted_for_everyone THEN 'This message was deleted'
                      WHEN lastm.attachment_kind = 'image' THEN COALESCE(NULLIF(lastm.body, ''), 'Photo')
                      WHEN lastm.attachment_kind = 'audio' THEN 'Voice message'
                      WHEN lastm.attachment_kind = 'document' THEN COALESCE(lastm.attachment_name, 'Document')
                      ELSE COALESCE(lastm.body, '')
                    END
             FROM attendance_parent_messages lastm
             WHERE lastm.thread_id = t.id
               AND COALESCE(lastm.hidden_for_admin, FALSE) = FALSE
             ORDER BY lastm.id DESC
             LIMIT 1
            ) AS visible_preview
     FROM attendance_parent_threads t
     JOIN attendance_users u ON u.id = t.parent_user_id
     ${where}
     ORDER BY t.last_message_at DESC NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    total: countRows[0]?.n || 0,
    page: p,
    pageSize: size,
    threads: rows.map((row) => ({
      id: Number(row.id),
      parentUserId: Number(row.parent_user_id),
      parentName: row.parent_name || 'Parent',
      parentPhone: row.parent_phone || '',
      lastMessageAt: row.last_message_at,
      lastMessagePreview: row.visible_preview || row.last_message_preview || '',
      lastSenderRole: row.last_sender_role,
      timeLabel: formatHHMM12(row.last_message_at),
      unreadCount: Number(row.unread_count || 0),
    })),
  };
}

async function getAdminThread(threadId) {
  const thread = await getThreadById(threadId);
  if (!thread) {
    const err = new Error('Conversation not found.');
    err.status = 404;
    throw err;
  }
  const messages = await listMessages(thread.id, { limit: PAGE, viewerRole: 'admin' });
  return {
    thread: {
      id: Number(thread.id),
      parentUserId: Number(thread.parent_user_id),
      parentName: thread.parent_name || 'Parent',
      parentPhone: thread.parent_phone || '',
    },
    messages,
  };
}

async function sendAdminMessage(adminUserId, threadId, { body, file }) {
  const thread = await getThreadById(threadId);
  if (!thread) {
    const err = new Error('Conversation not found.');
    err.status = 404;
    throw err;
  }
  return sendMessage({
    threadId: thread.id,
    senderRole: 'admin',
    senderUserId: adminUserId,
    body,
    file,
  });
}

async function getMessageFile(messageId, { parentUserId, admin } = {}) {
  const { rows } = await pool.query(
    `SELECT m.*, t.parent_user_id
     FROM attendance_parent_messages m
     JOIN attendance_parent_threads t ON t.id = m.thread_id
     WHERE m.id = $1`,
    [messageId]
  );
  const row = rows[0];
  if (!row || !row.attachment_url || row.deleted_for_everyone) {
    const err = new Error('File not found.');
    err.status = 404;
    throw err;
  }
  if (!admin && Number(row.parent_user_id) !== Number(parentUserId)) {
    const err = new Error('Forbidden.');
    err.status = 403;
    throw err;
  }
  if (admin && row.hidden_for_admin) {
    const err = new Error('File not found.');
    err.status = 404;
    throw err;
  }
  if (!admin && row.hidden_for_parent) {
    const err = new Error('File not found.');
    err.status = 404;
    throw err;
  }
  const file = await readChatFile(row.attachment_url);
  if (!file) {
    const err = new Error('File unavailable.');
    err.status = 502;
    throw err;
  }
  return {
    buffer: file.buffer,
    contentType: row.attachment_mime || file.contentType || 'application/octet-stream',
    name: row.attachment_name || 'attachment',
  };
}

async function deleteChatMessage({
  messageId,
  actorRole,
  parentUserId,
  admin,
  scope,
}) {
  const { rows } = await pool.query(
    `SELECT m.*, t.parent_user_id
     FROM attendance_parent_messages m
     JOIN attendance_parent_threads t ON t.id = m.thread_id
     WHERE m.id = $1`,
    [messageId]
  );
  const row = rows[0];
  if (!row) {
    const err = new Error('Message not found.');
    err.status = 404;
    throw err;
  }
  if (!admin && Number(row.parent_user_id) !== Number(parentUserId)) {
    const err = new Error('Forbidden.');
    err.status = 403;
    throw err;
  }
  const mode = scope === 'everyone' ? 'everyone' : 'me';
  if (mode === 'everyone') {
    if (row.sender_role !== actorRole) {
      const err = new Error('You can only delete your own messages for everyone.');
      err.status = 403;
      throw err;
    }
    const updated = await pool.query(
      `UPDATE attendance_parent_messages
       SET deleted_for_everyone = TRUE,
           body = '',
           attachment_kind = NULL,
           attachment_url = NULL,
           attachment_name = NULL,
           attachment_mime = NULL,
           attachment_size = NULL
       WHERE id = $1
       RETURNING *`,
      [messageId]
    );
    await refreshThreadPreview(row.thread_id);
    return { scope: 'everyone', message: mapMessage(updated.rows[0]) };
  }

  const col = hiddenColumn(actorRole);
  await pool.query(
    `UPDATE attendance_parent_messages SET ${col} = TRUE WHERE id = $1`,
    [messageId]
  );
  return { scope: 'me', id: Number(messageId) };
}

async function deleteChatMessages({
  messageIds,
  actorRole,
  parentUserId,
  admin,
  scope,
}) {
  const ids = [...new Set((messageIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))].slice(
    0,
    100
  );
  if (!ids.length) {
    const err = new Error('Select at least one message.');
    err.status = 400;
    throw err;
  }
  const hiddenIds = [];
  const messages = [];
  for (const messageId of ids) {
    const result = await deleteChatMessage({
      messageId,
      actorRole,
      parentUserId,
      admin,
      scope,
    });
    if (result.scope === 'me' && result.id) hiddenIds.push(result.id);
    if (result.message) messages.push(result.message);
  }
  return { scope: scope === 'everyone' ? 'everyone' : 'me', hiddenIds, messages };
}

module.exports = {
  getParentChat,
  listMessages,
  sendParentMessage,
  markParentRead,
  listAdminThreads,
  getAdminThread,
  sendAdminMessage,
  markRead,
  getMessageFile,
  getOrCreateThread,
  parentChatUnread,
  getThreadById,
  deleteChatMessage,
  deleteChatMessages,
};
