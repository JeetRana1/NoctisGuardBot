require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { generateInfoCard } = require('../src/bot/utils/image');

async function writeSample(filename, buf){
  const outDir = path.join(process.cwd(), 'data', 'generated', 'samples');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, buf);
  console.log('Wrote', outPath);
}

async function run(){
  try{
    // sample server info
    const serverRows = [
      { label: 'ID', value: '123456789012345678' },
      { label: 'Owner', value: 'Owner#0001' },
      { label: 'Members', value: '150 (online: 23)' },
      { label: 'Created', value: 'Mon, 01 Jan 2020 00:00:00 GMT' },
      { label: 'Roles', value: '12' },
      { label: 'Channels', value: '45' },
    ];
    const serverImg = await generateInfoCard({ title: 'Example Server', subtitle: '123456789012345678', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4', rows: serverRows, color: '#2dd4bf' });
    await writeSample('sample-serverinfo.png', serverImg);

    // sample user info
    const userRows = [
      { label: 'ID', value: '987654321098765432' },
      { label: 'Tag', value: 'SampleUser#1234' },
      { label: 'Bot', value: 'No' },
      { label: 'Created', value: 'Tue, 02 Feb 2021 12:34:56 GMT' },
      { label: 'Joined', value: 'Wed, 03 Mar 2021 12:34:56 GMT' },
      { label: 'Status', value: 'online' },
      { label: 'Roles', value: 'Moderator, Helper' },
    ];
    const userImg = await generateInfoCard({ title: 'SampleUser', subtitle: '#1234', avatarUrl: 'https://avatars.githubusercontent.com/u/583231?s=200&v=4', rows: userRows, color: '#60a5fa', status: 'online' });
    await writeSample('sample-userinfo.png', userImg);

    // sample uptime
    const uptimeRows = [
      { label: 'Uptime', value: '3d 4h 12m' },
      { label: 'Started', value: 'Tue, 20 Jan 2026 10:00:00 GMT' },
      { label: 'Node', value: process.version },
      { label: 'Memory (RSS)', value: '128 MB' },
      { label: 'Guilds', value: '12' },
      { label: 'Users (cached)', value: '1234' },
    ];
    const uptimeImg = await generateInfoCard({ title: 'Bot Uptime', subtitle: 'NoctisGuard#0789', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4', rows: uptimeRows, color: '#f97316' });
    await writeSample('sample-uptime.png', uptimeImg);

    // sample welcome
    const welcomeSample = await require('../src/bot/utils/image').generateWelcomeCard({ username: 'NewUser', discriminator: '1234', avatarUrl: 'https://avatars.githubusercontent.com/u/583231?s=200&v=4', serverName: 'Example Server', message: 'Say hi and read the rules!' });
    await writeSample('sample-welcome.png', welcomeSample);

    const byeSample = await require('../src/bot/utils/image').generateByeCard({ username: 'OldUser', discriminator: '4321', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4', serverName: 'Example Server', message: 'We wish you the best!' });
    await writeSample('sample-bye.png', byeSample);

    console.log('All samples generated.');
  }catch(e){
    console.error('Failed to generate samples', e);
    process.exit(1);
  }
}

run();
