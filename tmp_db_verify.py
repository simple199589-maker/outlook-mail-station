import sqlite3

db = r"D:\work\python\outlook-mail-station\data\outlook_mail_station.db"
conn = sqlite3.connect(db)
cur = conn.cursor()
print(cur.execute("select id, username, role, enabled from station_users order by id").fetchall())
print(cur.execute("select count(*) from station_users where username = 'test'").fetchone())
print(cur.execute("select count(*) from outlook_accounts where owner_user_id not in (select id from station_users)").fetchone())
print(cur.execute("select count(*) from user_mailbox_leases where user_id not in (select id from station_users)").fetchone())
conn.close()
