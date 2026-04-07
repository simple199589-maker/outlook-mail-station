import sqlite3

db = r"D:\work\python\outlook-mail-station\data\outlook_mail_station.db"
conn = sqlite3.connect(db)
cur = conn.cursor()
username = 'test'
cur.execute("update outlook_accounts set owner_user_id = 2 where owner_user_id = (select id from station_users where username = ?)", (username,))
cur.execute("delete from user_mailbox_leases where user_id = (select id from station_users where username = ?)", (username,))
cur.execute("delete from station_users where username = ?", (username,))
conn.commit()
print(cur.execute("select id, username from station_users order by id").fetchall())
conn.close()
