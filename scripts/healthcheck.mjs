try {
  const response = await fetch('http://127.0.0.1:3001/ready', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    console.error('Readiness HTTP ' + response.status + ': ' + (await response.text()).trim());
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Readiness request failed: ' + (error.cause?.code || error.code || error.name));
  process.exitCode = 1;
}
