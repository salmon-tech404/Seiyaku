import React, { useState } from 'react';
import { useTranslation } from '../../shared/i18n/index.js';
import {
  Button,
  Card,
  Chip,
  Meter,
  Countdown,
  FieldRow,
  Dialog,
  EmptyState,
  ErrorState,
  AddressText,
  AmountText,
  TimeText,
} from '../../shared/ui/index.js';

export function StyleguidePage() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(false);

  const sampleAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const sampleAmount = 25000000n; // 25 USDC
  const sampleFutureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour ahead

  return (
    <div
      className="styleguide-page"
      style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}
    >
      <div>
        <h1 tabIndex={-1}>{t('styleguide.title')}</h1>
        <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>{t('styleguide.subtitle')}</p>
      </div>

      {/* Buttons section */}
      <Card>
        <h2>{t('styleguide.buttons')}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
          <Button variant="primary">
            <span>{t('styleguide.buttonPrimary')}</span>
          </Button>
          <Button variant="secondary">
            <span>{t('styleguide.buttonSecondary')}</span>
          </Button>
          <Button variant="danger">
            <span>{t('styleguide.buttonDanger')}</span>
          </Button>
          <Button variant="quiet">
            <span>{t('styleguide.buttonQuiet')}</span>
          </Button>
          <Button loading>
            <span>{t('styleguide.buttonLoading')}</span>
          </Button>
        </div>
      </Card>

      {/* Chips section */}
      <Card>
        <h2>{t('styleguide.chips')}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
          <Chip variant="active">
            <span>{t('status.active')}</span>
          </Chip>
          <Chip variant="frozen">
            <span>{t('status.frozen')}</span>
          </Chip>
          <Chip variant="expired">
            <span>{t('status.expired')}</span>
          </Chip>
          <Chip variant="pending">
            <span>{t('status.pending')}</span>
          </Chip>
        </div>
      </Card>

      {/* Meters & Countdowns */}
      <Card>
        <h2>{t('styleguide.meters')}</h2>
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Meter label={t('styleguide.meterLabel')} value={65} max={100} unit="USDC" />
        </div>

        <h2 style={{ marginTop: '24px' }}>{t('styleguide.countdowns')}</h2>
        <div style={{ marginTop: '16px' }}>
          <Countdown targetTimestampSec={sampleFutureTimestamp} />
        </div>
      </Card>

      {/* Cards section */}
      <Card
        selected={selectedCard}
        onClick={() => setSelectedCard(!selectedCard)}
        style={{ cursor: 'pointer' }}
      >
        <h2>{t('styleguide.cardTitle')}</h2>
        <p style={{ color: 'var(--color-muted)', marginTop: '8px' }}>{t('styleguide.cardDesc')}</p>
      </Card>

      {/* Field rows with tooltips */}
      <Card>
        <h2>{t('styleguide.fieldRows')}</h2>
        <div style={{ marginTop: '16px' }}>
          <FieldRow label={t('styleguide.fieldLabel')} tooltip={t('styleguide.fieldTooltip')}>
            <AmountText amount={sampleAmount} decimals={6} unit="USDC" />
          </FieldRow>
        </div>
      </Card>

      {/* Text formatting */}
      <Card>
        <h2>{t('styleguide.textFormatting')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          <div>
            <AddressText address={sampleAddress} />
          </div>
          <div>
            <AmountText amount={500000000n} decimals={6} unit="USDC" />
          </div>
          <div>
            <TimeText timestampSec={sampleFutureTimestamp} showRelative />
          </div>
        </div>
      </Card>

      {/* Dialog modal */}
      <Card>
        <h2>{t('styleguide.dialogs')}</h2>
        <div style={{ marginTop: '16px' }}>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <span>{t('styleguide.openDialog')}</span>
          </Button>

          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title={t('styleguide.dialogTitle')}
            footer={
              <>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  <span>{t('common.cancel')}</span>
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  <span>{t('common.confirm')}</span>
                </Button>
              </>
            }
          >
            <p>{t('styleguide.dialogBody')}</p>
          </Dialog>
        </div>
      </Card>

      {/* Empty & Error states */}
      <Card>
        <h2>{t('styleguide.states')}</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            marginTop: '16px',
          }}
        >
          <EmptyState title={t('styleguide.emptyTitle')} description={t('styleguide.emptyDesc')} />
          <ErrorState
            title={t('styleguide.errorTitle')}
            description={t('styleguide.errorDesc')}
            onRetry={() => {}}
          />
        </div>
      </Card>
    </div>
  );
}
