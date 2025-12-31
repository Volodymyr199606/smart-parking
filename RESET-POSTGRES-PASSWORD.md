# How to Reset PostgreSQL Password

## Option 1: Check if you wrote it down
- Did you save it somewhere during installation?
- Check your notes or password manager

## Option 2: Try common defaults
Some users don't set a password or use simple ones:
- `postgres` (common default)
- `admin`
- `password`
- `root`
- (blank/empty - just press Enter)

## Option 3: Reset the Password (If you forgot)

### Step 1: Edit PostgreSQL configuration
1. Open Notepad as Administrator:
   - Right-click Notepad → "Run as administrator"

2. Open the PostgreSQL config file:
   - File → Open
   - Navigate to: `C:\Program Files\PostgreSQL\16\data\` (or `15`, `14` depending on your version)
   - Change file filter to "All Files (*.*)"
   - Open `pg_hba.conf`

3. Find this line near the top:
   ```
   # TYPE  DATABASE        USER            ADDRESS                 METHOD
   local   all             all                                     scram-sha-256
   ```

4. Change `scram-sha-256` to `trust`:
   ```
   # TYPE  DATABASE        USER            ADDRESS                 METHOD
   local   all             all                                     trust
   ```

5. Save and close the file

### Step 2: Restart PostgreSQL Service
1. Press `Win + R`
2. Type: `services.msc` and press Enter
3. Find "postgresql-x64-16" (or your version)
4. Right-click → Restart

### Step 3: Reset Password
1. Open SQL Shell (psql) again
2. Press Enter for all connection prompts (no password needed now)
3. Run:
   ```sql
   ALTER USER postgres PASSWORD 'newpassword';
   ```
   (Replace `newpassword` with your chosen password)

4. Exit:
   ```sql
   \q
   ```

### Step 4: Restore Security
1. Edit `pg_hba.conf` again
2. Change `trust` back to `scram-sha-256`
3. Save and restart PostgreSQL service again

---

## Quick Test: Try Connecting Without Password First

Sometimes the password might not be required. Try:
1. Open SQL Shell
2. Press Enter for all prompts
3. If it connects, the password wasn't required!

