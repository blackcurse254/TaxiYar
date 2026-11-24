import { Pool } from 'pg';

export type PaymentStatus = 'pending' | 'claimed' | 'confirmed' | 'expired';

export interface DriverRow {
  id: number;
  slug: string;
  name: string;
  cardNumber: string;
  cardHolder: string;
  createdAt: string;
}

export interface PaymentRow {
  id: number;
  driverId: number;
  baseAmount: number;
  amount: number;
  status: PaymentStatus;
  announced: boolean;
  expiresAt: string;
  claimedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface PaymentWithDriver extends PaymentRow {
  driver: DriverRow;
}

export interface TaxiStore {
  readonly mode: 'neon' | 'memory';
  ensureSchema(): Promise<void>;
  upsertDriver(input: {
    slug: string;
    name: string;
    cardNumber: string;
    cardHolder: string;
  }): Promise<DriverRow>;
  getDriverBySlug(slug: string): Promise<DriverRow | null>;
  getDriverById(id: number): Promise<DriverRow | null>;
  listDrivers(): Promise<DriverRow[]>;
  createUniquePayment(input: {
    driverId: number;
    baseAmount: number;
    ttlMinutes?: number;
  }): Promise<PaymentRow | null>;
  getPaymentWithDriver(paymentId: number): Promise<PaymentWithDriver | null>;
  claimPayment(paymentId: number, driverId: number): Promise<PaymentRow | null>;
  confirmPayment(paymentId: number, driverId: number): Promise<PaymentRow | null>;
  syncDriver(driverId: number): Promise<{
    newlyConfirmed: PaymentRow[];
    claimedPayments: PaymentRow[];
    recentConfirmed: PaymentRow[];
    pendingCount: number;
  }>;
  processSmsWebhook(input: {
    driverId: number;
    replayKey: string;
    rawBody: string;
    amountCandidates: number[];
  }): Promise<{
    duplicate: boolean;
    matchedPayment: PaymentRow | null;
  }>;
}

function shuffledOffsets(): number[] {
  const arr = Array.from({ length: 90 }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class PostgresTaxiStore implements TaxiStore {
  readonly mode = 'neon' as const;
  private pool: Pool;
  private schemaPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl) && !/sslmode=require/i.test(databaseUrl);
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 15000,
    });
    this.pool.on('error', (err) => {
      console.error('Unexpected Neon PostgreSQL pool error:', err);
    });
  }

  async ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.runSchemaDDL().catch((err) => {
        this.schemaPromise = null;
        throw err;
      });
    }
    return this.schemaPromise;
  }

  private async runSchemaDDL(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        card_number TEXT NOT NULL,
        card_holder TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        base_amount INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'claimed', 'confirmed', 'expired')),
        announced BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        claimed_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS payments_driver_active_amount_uidx
        ON payments (driver_id, amount)
        WHERE status IN ('pending', 'claimed');

      CREATE TABLE IF NOT EXISTS hook_log (
        id BIGSERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
        replay_key TEXT NOT NULL UNIQUE,
        raw_body TEXT NOT NULL,
        parsed_amount INTEGER,
        matched_payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  private mapDriver(row: Record<string, unknown>): DriverRow {
    return {
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      cardNumber: String(row.card_number),
      cardHolder: String(row.card_holder),
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  private mapPayment(row: Record<string, unknown>): PaymentRow {
    return {
      id: Number(row.id),
      driverId: Number(row.driver_id),
      baseAmount: Number(row.base_amount),
      amount: Number(row.amount),
      status: row.status as PaymentStatus,
      announced: Boolean(row.announced),
      expiresAt: new Date(String(row.expires_at)).toISOString(),
      claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : null,
      confirmedAt: row.confirmed_at ? new Date(String(row.confirmed_at)).toISOString() : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  private async expireStale(): Promise<void> {
    await this.pool.query(
      `UPDATE payments SET status = 'expired'
       WHERE status IN ('pending', 'claimed') AND expires_at <= NOW()`
    );
  }

  async upsertDriver(input: {
    slug: string;
    name: string;
    cardNumber: string;
    cardHolder: string;
  }): Promise<DriverRow> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `INSERT INTO drivers (slug, name, card_number, card_holder)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         card_number = EXCLUDED.card_number,
         card_holder = EXCLUDED.card_holder
       RETURNING *`,
      [input.slug, input.name, input.cardNumber, input.cardHolder]
    );
    return this.mapDriver(res.rows[0]);
  }

  async getDriverBySlug(slug: string): Promise<DriverRow | null> {
    await this.ensureSchema();
    const res = await this.pool.query('SELECT * FROM drivers WHERE slug = $1', [slug]);
    return res.rows[0] ? this.mapDriver(res.rows[0]) : null;
  }

  async getDriverById(id: number): Promise<DriverRow | null> {
    await this.ensureSchema();
    const res = await this.pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
    return res.rows[0] ? this.mapDriver(res.rows[0]) : null;
  }

  async listDrivers(): Promise<DriverRow[]> {
    await this.ensureSchema();
    const res = await this.pool.query('SELECT * FROM drivers ORDER BY id DESC LIMIT 50');
    return res.rows.map((r) => this.mapDriver(r));
  }

  async createUniquePayment(input: {
    driverId: number;
    baseAmount: number;
    ttlMinutes?: number;
  }): Promise<PaymentRow | null> {
    await this.ensureSchema();
    await this.expireStale();
    const ttlMinutes = input.ttlMinutes ?? 15;
    const offsets = shuffledOffsets();

    for (const offset of offsets) {
      const amount = input.baseAmount + offset;
      try {
        const res = await this.pool.query(
          `INSERT INTO payments (driver_id, base_amount, amount, status, announced, expires_at)
           VALUES ($1, $2, $3, 'pending', FALSE, NOW() + ($4 || ' minutes')::interval)
           RETURNING *`,
          [input.driverId, input.baseAmount, amount, String(ttlMinutes)]
        );
        return this.mapPayment(res.rows[0]);
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') {
          continue; // Unique active amount collision -> try next offset
        }
        throw err;
      }
    }
    return null;
  }

  async getPaymentWithDriver(paymentId: number): Promise<PaymentWithDriver | null> {
    await this.ensureSchema();
    await this.expireStale();
    const res = await this.pool.query(
      `SELECT p.*, d.slug AS d_slug, d.name AS d_name, d.card_number AS d_card_number,
              d.card_holder AS d_card_holder, d.created_at AS d_created_at
       FROM payments p
       JOIN drivers d ON d.id = p.driver_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...this.mapPayment(row),
      driver: {
        id: Number(row.driver_id),
        slug: String(row.d_slug),
        name: String(row.d_name),
        cardNumber: String(row.d_card_number),
        cardHolder: String(row.d_card_holder),
        createdAt: new Date(String(row.d_created_at)).toISOString(),
      },
    };
  }

  async claimPayment(paymentId: number, driverId: number): Promise<PaymentRow | null> {
    await this.ensureSchema();
    await this.expireStale();
    const res = await this.pool.query(
      `UPDATE payments
       SET status = CASE WHEN status = 'pending' THEN 'claimed' ELSE status END,
           claimed_at = COALESCE(claimed_at, NOW())
       WHERE id = $1 AND driver_id = $2 AND status IN ('pending', 'claimed')
       RETURNING *`,
      [paymentId, driverId]
    );
    if (res.rows[0]) return this.mapPayment(res.rows[0]);
    const current = await this.pool.query('SELECT * FROM payments WHERE id = $1 AND driver_id = $2', [
      paymentId,
      driverId,
    ]);
    return current.rows[0] ? this.mapPayment(current.rows[0]) : null;
  }

  async confirmPayment(paymentId: number, driverId: number): Promise<PaymentRow | null> {
    await this.ensureSchema();
    await this.expireStale();
    const res = await this.pool.query(
      `UPDATE payments
       SET status = 'confirmed',
           confirmed_at = COALESCE(confirmed_at, NOW()),
           announced = TRUE
       WHERE id = $1 AND driver_id = $2 AND status IN ('pending', 'claimed', 'confirmed')
       RETURNING *`,
      [paymentId, driverId]
    );
    return res.rows[0] ? this.mapPayment(res.rows[0]) : null;
  }

  async syncDriver(driverId: number) {
    await this.ensureSchema();
    await this.expireStale();

    const newlyConfirmedRes = await this.pool.query(
      `UPDATE payments
       SET announced = TRUE
       WHERE driver_id = $1 AND status = 'confirmed' AND announced = FALSE
       RETURNING *`,
      [driverId]
    );

    const claimedRes = await this.pool.query(
      `SELECT * FROM payments
       WHERE driver_id = $1 AND status = 'claimed'
       ORDER BY claimed_at DESC NULLS LAST, id DESC
       LIMIT 20`,
      [driverId]
    );

    const recentConfirmedRes = await this.pool.query(
      `SELECT * FROM payments
       WHERE driver_id = $1 AND status = 'confirmed'
       ORDER BY confirmed_at DESC NULLS LAST, id DESC
       LIMIT 10`,
      [driverId]
    );

    const pendingCountRes = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM payments
       WHERE driver_id = $1 AND status = 'pending'`,
      [driverId]
    );

    return {
      newlyConfirmed: newlyConfirmedRes.rows.map((r) => this.mapPayment(r)),
      claimedPayments: claimedRes.rows.map((r) => this.mapPayment(r)),
      recentConfirmed: recentConfirmedRes.rows.map((r) => this.mapPayment(r)),
      pendingCount: Number(pendingCountRes.rows[0]?.cnt ?? 0),
    };
  }

  async processSmsWebhook(input: {
    driverId: number;
    replayKey: string;
    rawBody: string;
    amountCandidates: number[];
  }): Promise<{ duplicate: boolean; matchedPayment: PaymentRow | null }> {
    await this.ensureSchema();
    await this.expireStale();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const logInsert = await client.query(
        `INSERT INTO hook_log (driver_id, replay_key, raw_body, parsed_amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (replay_key) DO NOTHING
         RETURNING id`,
        [input.driverId, input.replayKey, input.rawBody, input.amountCandidates[0] ?? null]
      );

      if (logInsert.rowCount === 0) {
        await client.query('ROLLBACK');
        return { duplicate: true, matchedPayment: null };
      }

      const hookLogId = logInsert.rows[0].id;
      let matchedPayment: PaymentRow | null = null;

      if (input.amountCandidates.length > 0) {
        const matchRes = await client.query(
          `SELECT * FROM payments
           WHERE driver_id = $1
             AND status IN ('pending', 'claimed')
             AND amount = ANY($2::int[])
           ORDER BY CASE status WHEN 'claimed' THEN 0 ELSE 1 END, id DESC
           LIMIT 1
           FOR UPDATE`,
          [input.driverId, input.amountCandidates]
        );

        if (matchRes.rows[0]) {
          const updated = await client.query(
            `UPDATE payments
             SET status = 'confirmed',
                 confirmed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [matchRes.rows[0].id]
          );
          matchedPayment = this.mapPayment(updated.rows[0]);
          await client.query(
            `UPDATE hook_log SET matched_payment_id = $1, parsed_amount = $2 WHERE id = $3`,
            [matchedPayment.id, matchedPayment.amount, hookLogId]
          );
        }
      }

      await client.query('COMMIT');
      return { duplicate: false, matchedPayment };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export class MemoryTaxiStore implements TaxiStore {
  readonly mode = 'memory' as const;
  private driverSeq = 1;
  private paymentSeq = 1001;
  private drivers: DriverRow[] = [];
  private payments: PaymentRow[] = [];
  private hookReplayKeys = new Set<string>();

  async ensureSchema(): Promise<void> {
    // In-memory store mimics the Neon DDL schema without external network DB
  }

  private expireStale(): void {
    const now = Date.now();
    for (const p of this.payments) {
      if ((p.status === 'pending' || p.status === 'claimed') && new Date(p.expiresAt).getTime() <= now) {
        p.status = 'expired';
      }
    }
  }

  async upsertDriver(input: {
    slug: string;
    name: string;
    cardNumber: string;
    cardHolder: string;
  }): Promise<DriverRow> {
    const existing = this.drivers.find((d) => d.slug === input.slug);
    if (existing) {
      existing.name = input.name;
      existing.cardNumber = input.cardNumber;
      existing.cardHolder = input.cardHolder;
      return { ...existing };
    }
    const created: DriverRow = {
      id: this.driverSeq++,
      slug: input.slug,
      name: input.name,
      cardNumber: input.cardNumber,
      cardHolder: input.cardHolder,
      createdAt: new Date().toISOString(),
    };
    this.drivers.push(created);
    return { ...created };
  }

  async getDriverBySlug(slug: string): Promise<DriverRow | null> {
    const found = this.drivers.find((d) => d.slug === slug);
    return found ? { ...found } : null;
  }

  async getDriverById(id: number): Promise<DriverRow | null> {
    const found = this.drivers.find((d) => d.id === id);
    return found ? { ...found } : null;
  }

  async listDrivers(): Promise<DriverRow[]> {
    return [...this.drivers].sort((a, b) => b.id - a.id).map((d) => ({ ...d }));
  }

  async createUniquePayment(input: {
    driverId: number;
    baseAmount: number;
    ttlMinutes?: number;
  }): Promise<PaymentRow | null> {
    this.expireStale();
    const ttlMinutes = input.ttlMinutes ?? 15;
    const activeAmounts = new Set(
      this.payments
        .filter((p) => p.driverId === input.driverId && (p.status === 'pending' || p.status === 'claimed'))
        .map((p) => p.amount)
    );

    for (const offset of shuffledOffsets()) {
      const amount = input.baseAmount + offset;
      if (activeAmounts.has(amount)) continue;
      const now = Date.now();
      const row: PaymentRow = {
        id: this.paymentSeq++,
        driverId: input.driverId,
        baseAmount: input.baseAmount,
        amount,
        status: 'pending',
        announced: false,
        expiresAt: new Date(now + ttlMinutes * 60 * 1000).toISOString(),
        claimedAt: null,
        confirmedAt: null,
        createdAt: new Date(now).toISOString(),
      };
      this.payments.push(row);
      return { ...row };
    }
    return null;
  }

  async getPaymentWithDriver(paymentId: number): Promise<PaymentWithDriver | null> {
    this.expireStale();
    const payment = this.payments.find((p) => p.id === paymentId);
    if (!payment) return null;
    const driver = this.drivers.find((d) => d.id === payment.driverId);
    if (!driver) return null;
    return { ...payment, driver: { ...driver } };
  }

  async claimPayment(paymentId: number, driverId: number): Promise<PaymentRow | null> {
    this.expireStale();
    const payment = this.payments.find((p) => p.id === paymentId && p.driverId === driverId);
    if (!payment) return null;
    if (payment.status === 'pending') {
      payment.status = 'claimed';
      payment.claimedAt = new Date().toISOString();
    }
    return { ...payment };
  }

  async confirmPayment(paymentId: number, driverId: number): Promise<PaymentRow | null> {
    this.expireStale();
    const payment = this.payments.find((p) => p.id === paymentId && p.driverId === driverId);
    if (!payment) return null;
    if (payment.status === 'pending' || payment.status === 'claimed' || payment.status === 'confirmed') {
      payment.status = 'confirmed';
      payment.confirmedAt = payment.confirmedAt ?? new Date().toISOString();
      payment.announced = true;
      return { ...payment };
    }
    return null;
  }

  async syncDriver(driverId: number) {
    this.expireStale();
    const newlyConfirmed: PaymentRow[] = [];
    for (const p of this.payments) {
      if (p.driverId === driverId && p.status === 'confirmed' && !p.announced) {
        p.announced = true;
        newlyConfirmed.push({ ...p });
      }
    }
    const claimedPayments = this.payments
      .filter((p) => p.driverId === driverId && p.status === 'claimed')
      .sort((a, b) => b.id - a.id)
      .slice(0, 20)
      .map((p) => ({ ...p }));
    const recentConfirmed = this.payments
      .filter((p) => p.driverId === driverId && p.status === 'confirmed')
      .sort((a, b) => b.id - a.id)
      .slice(0, 10)
      .map((p) => ({ ...p }));
    const pendingCount = this.payments.filter(
      (p) => p.driverId === driverId && p.status === 'pending'
    ).length;

    return { newlyConfirmed, claimedPayments, recentConfirmed, pendingCount };
  }

  async processSmsWebhook(input: {
    driverId: number;
    replayKey: string;
    rawBody: string;
    amountCandidates: number[];
  }): Promise<{ duplicate: boolean; matchedPayment: PaymentRow | null }> {
    this.expireStale();
    if (this.hookReplayKeys.has(input.replayKey)) {
      return { duplicate: true, matchedPayment: null };
    }
    this.hookReplayKeys.add(input.replayKey);

    if (input.amountCandidates.length === 0) {
      return { duplicate: false, matchedPayment: null };
    }

    const candidates = this.payments
      .filter(
        (p) =>
          p.driverId === input.driverId &&
          (p.status === 'pending' || p.status === 'claimed') &&
          input.amountCandidates.includes(p.amount)
      )
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'claimed' ? -1 : 1;
        return b.id - a.id;
      });

    const match = candidates[0];
    if (!match) {
      return { duplicate: false, matchedPayment: null };
    }

    match.status = 'confirmed';
    match.confirmedAt = new Date().toISOString();
    return { duplicate: false, matchedPayment: { ...match } };
  }
}

export function createStoreFromEnv(): TaxiStore {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return new PostgresTaxiStore(databaseUrl);
  }
  return new MemoryTaxiStore();
}
