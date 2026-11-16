exports.name = 'error banner and reconnect banner';
exports.run = async t => {
  const p = await t.open(), pg = p.pg;
  await pg.evaluate(() => { setTimeout(() => { throw new Error('test explosion'); }, 5); }); await pg.waitForSelector('#diagBar', { state: 'visible' });
  t.ok(/test explosion/.test(await pg.textContent('#diagMsg')), 'an error shows on screen');
  t.ok(/test explosion/.test(await pg.evaluate(() => diagReport())), 'the debug info contains the error'); t.ok(/browser:/.test(await pg.evaluate(() => diagReport())), 'and the browser');
  const seq = await pg.evaluate(() => { roomCode = 'abcde'; const out = []; for (let i = 0; i < 6; i++) { clearTimeout(joinTimer); joinFail('peer-unavailable'); out.push(document.getElementById('connBar').innerText); } return out; });
  t.ok(/1\/5/.test(seq[0]) && /5\/5/.test(seq[4]), 'joining retries up to 5 times'); t.ok(/not found/.test(seq[5]) && /Try again/.test(seq[5]), 'then explains what to do');
  await pg.evaluate(() => { connUI.lostAdd('Blue'); connUI.lostAdd('Red'); }); t.ok(/Blue, Red/.test(await pg.textContent('#connBar')), 'the host sees who is missing');
  await pg.evaluate(() => { connUI.lostDel('Blue'); connUI.lostDel('Red'); }); t.ok(/back/.test(await pg.textContent('#connBar')), 'and when they are back');
  await p.close();
};
