const fs = require('fs');
const path = require('path');

describe('health endpoint metadata', () => {
  test('advertises backend v1.9 in health response', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    expect(serverSource).toContain("message: 'AI JunkYYC Backend API is running (TELEGRAM v1.9)'");
    expect(serverSource).toContain("version: '1.9'");
  });
});
