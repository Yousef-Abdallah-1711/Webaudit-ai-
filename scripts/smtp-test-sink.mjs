// Minimal TLS SMTP sink for verifying WebAudit AI's SMTP mailer end-to-end.
// Accepts one message over implicit TLS and writes it to /tmp/smtp-captured.txt
import { createServer } from 'node:tls';
import { readFileSync, writeFileSync } from 'node:fs';

const key = readFileSync(process.argv[2]);
const cert = readFileSync(process.argv[3]);
let buffer = '';
let captured = { from: '', to: '', data: '' };
let inData = false;

const server = createServer({ key, cert }, (socket) => {
  const reply = (line) => socket.write(line + '\r\n');
  reply('220 localhost ESMTP webaudit-test-sink');
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (inData) {
        if (line === '.') {
          inData = false;
          reply('250 2.0.0 Ok: queued');
          writeFileSync(
            'H:\\Projects\\Webaudit-ai-\\logs\\smtp-captured.eml',
            `FROM: ${captured.from}\nTO: ${captured.to}\n\n${captured.data}`,
          );
          console.log('MESSAGE-CAPTURED from=' + captured.from + ' to=' + captured.to +
            ' bytes=' + captured.data.length);
          setTimeout(() => process.exit(0), 300);
        } else {
          captured.data += line + '\n';
        }
        continue;
      }
      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        reply('250-localhost greets you');
        reply('250 AUTH LOGIN PLAIN');
      } else if (upper.startsWith('AUTH')) {
        reply('235 2.7.0 Authentication successful');
      } else if (upper.startsWith('MAIL FROM')) {
        captured.from = line;
        reply('250 2.1.0 Ok');
      } else if (upper.startsWith('RCPT TO')) {
        captured.to = line;
        reply('250 2.1.5 Ok');
      } else if (upper === 'DATA') {
        inData = true;
        reply('354 End data with <CR><LF>.<CR><LF>');
      } else if (upper === 'RSET') {
        reply('250 2.0.0 Ok');
      } else if (upper === 'NOOP') {
        reply('250 2.0.0 Ok');
      } else if (upper === 'QUIT') {
        reply('221 2.0.0 Bye');
        socket.end();
      } else {
        reply('250 2.0.0 Ok');
      }
    }
  });
});
server.listen(2465, '127.0.0.1', () => console.log('sink-listening on 127.0.0.1:2465'));
setTimeout(() => { console.log('sink-timeout'); process.exit(1); }, 600000);
