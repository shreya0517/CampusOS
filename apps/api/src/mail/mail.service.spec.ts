import { getMailConfig } from './mail.service';

describe('getMailConfig', () => {
  it('is off without an SMTP host or a sender', () => {
    expect(getMailConfig({})).toBeNull();
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.test' })).toBeNull();
  });

  it('reads SMTP settings, sending from SMTP_USER unless MAIL_FROM is set', () => {
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.test', SMTP_USER: 'campus@example.test', SMTP_PASS: 'app-password' })).toEqual({
      host: 'smtp.example.test', port: 587, secure: false, user: 'campus@example.test', pass: 'app-password', from: 'campus@example.test',
    });
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', MAIL_FROM: 'CampusOS <no-reply@example.test>' })).toMatchObject({ port: 465, secure: true, from: 'CampusOS <no-reply@example.test>', user: undefined });
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: '2525', SMTP_SECURE: 'true', MAIL_FROM: 'a@example.test' })).toMatchObject({ port: 2525, secure: true });
  });

  it('treats blank values as unset, as .env.example leaves them', () => {
    expect(getMailConfig({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: '', SMTP_USER: 'campus@example.test', MAIL_FROM: '' })).toMatchObject({ port: 587, from: 'campus@example.test' });
    expect(getMailConfig({ SMTP_HOST: '', SMTP_USER: 'campus@example.test' })).toBeNull();
  });

  it('rejects a bad port', () => {
    expect(() => getMailConfig({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: 'abc', MAIL_FROM: 'a@example.test' })).toThrow('SMTP_PORT');
  });
});
